import { createCwmsApi, getCdaConfig } from "../api/cdaClient";
import type { ColumnDefConfig, InventoryDataset, InventoryRow } from "../types";

interface TimeSeriesCategoryLike {
	officeId?: string;
	id?: string;
	description?: string;
}

interface AssignedTimeSeriesLike {
	officeId?: string;
	timeseriesId?: string;
	aliasId?: string;
	refTsId?: string;
	attribute?: number;
}

interface TimeSeriesGroupLike {
	officeId?: string;
	id?: string;
	timeSeriesCategory?: TimeSeriesCategoryLike;
	description?: string;
	sharedAliasId?: string;
	sharedRefTsId?: string;
	assignedTimeSeries?: AssignedTimeSeriesLike[];
}

interface ApiResponseLike<T> {
	raw: Response;
	value(): Promise<T>;
}

const timeSeriesGroupColumns: ColumnDefConfig[] = [
	{
		id: "name",
		header: "Category/Group/Time Series",
		accessorKey: "name",
		group: "Time Series Groups",
		width: 300,
		defaultVisible: true,
		pinned: true,
	},
	{ id: "office", header: "Office", accessorKey: "office", group: "Time Series Groups", defaultVisible: true },
	{
		id: "description",
		header: "Description",
		accessorKey: "description",
		group: "Time Series Groups",
		defaultVisible: true,
	},
	{
		id: "referenceTimeSeries",
		header: "Reference Time Series",
		accessorKey: "referenceTimeSeries",
		group: "Time Series Groups",
		defaultVisible: true,
	},
	{ id: "alias", header: "Alias", accessorKey: "alias", group: "Time Series Groups", defaultVisible: true },
	{
		id: "attribute",
		header: "Attribute",
		accessorKey: "attribute",
		group: "Time Series Groups",
		defaultVisible: true,
	},
];

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function normalizeOffice(value: string | undefined): string {
	return (value ?? "").trim().toUpperCase();
}

function isNotFoundError(caught: unknown): boolean {
	if (!caught || typeof caught !== "object") return false;
	const errorLike = caught as {
		status?: unknown;
		response?: { status?: unknown };
		cause?: { status?: unknown; response?: { status?: unknown } };
	};

	if (errorLike.status === 404) return true;
	if (errorLike.response?.status === 404) return true;
	if (errorLike.cause?.status === 404) return true;
	if (errorLike.cause?.response?.status === 404) return true;

	if (caught instanceof Error) return /\b404\b/.test(caught.message);
	return false;
}

function firstString(record: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return undefined;
}

function parseAssignedTimeSeries(value: unknown): AssignedTimeSeriesLike[] {
	const items = Array.isArray(value)
		? value
		: value && typeof value === "object"
			? ((value as Record<string, unknown>).descriptors ??
				(value as Record<string, unknown>)["assigned-time-series"] ??
				(value as Record<string, unknown>).assignedTimeSeries)
			: undefined;
	if (!Array.isArray(items)) return [];
	const rows: AssignedTimeSeriesLike[] = [];

	for (const item of items) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const descriptor =
			record.descriptor && typeof record.descriptor === "object"
				? (record.descriptor as Record<string, unknown>)
				: undefined;

		const officeId = firstString(record, ["office-id", "officeId"]);
		const timeseriesId = firstString(record, ["timeseries-id", "time-series-id", "timeseriesId", "timeSeriesId"]);
		const aliasId = firstString(record, ["alias-id", "aliasId"]);
		const refTsId = firstString(record, ["ref-ts-id", "refTsId", "reference-timeseries-id", "referenceTimeSeriesId"]);
		const attribute =
			firstNumber(record, ["attribute"]) ??
			(descriptor ? firstNumber(descriptor, ["attribute"]) : undefined);

		rows.push({
			officeId: officeId ?? (descriptor ? firstString(descriptor, ["office-id", "officeId"]) : undefined),
			timeseriesId:
				timeseriesId ??
				(descriptor
					? firstString(descriptor, ["timeseries-id", "time-series-id", "timeseriesId", "timeSeriesId"])
					: undefined),
			aliasId: aliasId,
			refTsId: refTsId,
			attribute,
		});
	}

	return rows;
}

function mapTimeSeriesGroupsFromRawJson(payload: unknown): TimeSeriesGroupLike[] {
	if (!Array.isArray(payload)) return [];
	const groups: TimeSeriesGroupLike[] = [];

	for (const item of payload) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const categoryRaw = (record["time-series-category"] ?? record.timeSeriesCategory) as
			| Record<string, unknown>
			| undefined;

		groups.push({
			officeId: firstString(record, ["office-id", "officeId"]),
			id: firstString(record, ["id"]),
			timeSeriesCategory: categoryRaw
				? {
						officeId: firstString(categoryRaw, ["office-id", "officeId"]),
						id: firstString(categoryRaw, ["id"]),
						description: firstString(categoryRaw, ["description"]),
					}
				: undefined,
			description: firstString(record, ["description"]),
			sharedAliasId: firstString(record, ["shared-alias-id", "sharedAliasId"]),
			sharedRefTsId: firstString(record, ["shared-ref-ts-id", "sharedRefTsId"]),
			assignedTimeSeries: parseAssignedTimeSeries(record["assigned-time-series"] ?? record.assignedTimeSeries),
		});
	}

	return groups;
}

async function readJsonResponse(response: Response): Promise<unknown> {
	const textBody = await response.text();
	try {
		return JSON.parse(textBody) as unknown;
	} catch {
		const sanitized = textBody.replace(/[\u0000-\u001F]/g, "");
		return JSON.parse(sanitized) as unknown;
	}
}

export async function fetchTimeSeriesGroupsInventory(): Promise<InventoryDataset> {
	const [categoriesApi, groupsApi] = await Promise.all([
		createCwmsApi<{
			getTimeSeriesCategory: (request?: { office?: string }) => Promise<TimeSeriesCategoryLike[]>;
		}>("TimeSeriesCategoriesApi"),
		createCwmsApi<{
			getTimeSeriesGroupRaw: (request?: {
				office?: string;
				includeAssigned?: boolean;
				timeseriesCategoryLike?: string;
				categoryOfficeId?: string;
				timeseriesGroupLike?: string;
			}) => Promise<ApiResponseLike<TimeSeriesGroupLike[]>>;
		}>("TimeSeriesGroupsApi"),
	]);

	if (!categoriesApi || !groupsApi) {
		throw new Error("CWMS time series group APIs are unavailable.");
	}

	const { office } = getCdaConfig();
	const normalizedSelectedOffice = normalizeOffice(office);
	const categoryOffices = normalizedSelectedOffice === "CWMS" ? [office] : [office, "CWMS"];

	const categories: TimeSeriesCategoryLike[] = [];
	let loadedCategoryPages = 0;
	const categoryErrors: string[] = [];

	for (const categoryOffice of categoryOffices) {
		try {
			const officeCategories = await categoriesApi.getTimeSeriesCategory({ office: categoryOffice });
			categories.push(...officeCategories);
			loadedCategoryPages += 1;
		} catch (caught) {
			if (isNotFoundError(caught)) continue;
			const message = caught instanceof Error ? caught.message : "Unknown category load error.";
			categoryErrors.push(`${categoryOffice}: ${message}`);
		}
	}

	const uniqueCategories = new Map<string, TimeSeriesCategoryLike>();
	for (const category of categories) {
		const categoryOffice = category.officeId ?? office;
		const categoryId = category.id;
		if (!categoryId) continue;
		uniqueCategories.set(`${normalizeOffice(categoryOffice)}:${categoryId}`, category);
	}

	const orderedCategories = [...uniqueCategories.values()].sort((left, right) => {
		const leftKey = `${text(left.officeId)}:${text(left.id)}`;
		const rightKey = `${text(right.officeId)}:${text(right.id)}`;
		return leftKey.localeCompare(rightKey);
	});

	const rows: InventoryRow[] = [];
	let loadedGroupPages = 0;
	const groupErrors: string[] = [];

	for (const category of orderedCategories) {
		if (!category.id) continue;

		const categoryOffice = category.officeId ?? office;
		const categoryId = category.id;
		const categoryRowId = `ts-category:${categoryOffice}:${categoryId}`;

		rows.push({
			id: categoryRowId,
			kind: "timeSeriesGroup",
			label: categoryId,
			name: categoryId,
			office: categoryOffice,
			description: category.description,
			depth: 0,
		});

		try {
			const groupResponse = await groupsApi.getTimeSeriesGroupRaw({
				office,
				includeAssigned: true,
				categoryOfficeId: categoryOffice,
				timeseriesCategoryLike: categoryId,
			});
			const groups = mapTimeSeriesGroupsFromRawJson(await readJsonResponse(groupResponse.raw));
			loadedGroupPages += 1;

			const orderedGroups = [...groups]
				.filter((group) => {
					const groupCategoryId = group.timeSeriesCategory?.id ?? categoryId;
					const groupOffice = group.officeId ?? office;
					return groupCategoryId === categoryId && normalizeOffice(groupOffice) === normalizeOffice(categoryOffice);
				})
				.sort((left, right) => text(left.id).localeCompare(text(right.id)));

			for (const group of orderedGroups) {
				if (!group.id) continue;
				const groupOffice = group.officeId ?? office;
				const groupRowId = `ts-group:${categoryOffice}:${categoryId}:${groupOffice}:${group.id}`;

				rows.push({
					id: groupRowId,
					parentId: categoryRowId,
					kind: "timeSeriesGroup",
					label: group.id,
					name: group.id,
					office: groupOffice,
					description: group.description,
					referenceTimeSeries: group.sharedRefTsId,
					depth: 1,
				});

				const assigned = [...(group.assignedTimeSeries ?? [])]
					.filter((member) => normalizeOffice(member.officeId ?? office) === normalizedSelectedOffice)
					.sort((left, right) => text(left.timeseriesId).localeCompare(text(right.timeseriesId)));

				for (let index = 0; index < assigned.length; index += 1) {
					const member = assigned[index];
					const timeseriesId = member.timeseriesId;
					if (!timeseriesId) continue;

					rows.push({
						id: `ts-member:${groupRowId}:${timeseriesId}:${index}`,
						parentId: groupRowId,
						kind: "timeSeries",
						label: timeseriesId,
						name: timeseriesId,
						office: member.officeId ?? groupOffice,
						referenceTimeSeries: member.refTsId,
						alias: member.aliasId,
						attribute: member.attribute,
						depth: 2,
					});
				}
			}
		} catch (caught) {
			if (isNotFoundError(caught)) continue;
			const message = caught instanceof Error ? caught.message : "Unknown time series group error.";
			groupErrors.push(`${categoryId}: ${message}`);
		}
	}

	const allErrors = [...categoryErrors, ...groupErrors];
	if (rows.length === 0 && allErrors.length > 0) {
		throw new Error(`Unable to load time series groups. ${allErrors[0]}`);
	}

	return {
		columns: timeSeriesGroupColumns,
		rows,
		pageInfo: {
			pagesLoaded: loadedCategoryPages + loadedGroupPages,
			totalRows: rows.length,
			pageSize: Math.max(rows.length, 1),
			exhausted: true,
			partial: allErrors.length > 0,
			errorPage: allErrors.length > 0 ? loadedCategoryPages + loadedGroupPages + 1 : undefined,
			warning: allErrors.length > 0 ? allErrors.join("; ") : undefined,
		},
	};
}
