import { createCwmsApi, getCdaConfig } from "../api/cdaClient";
import type { ColumnDefConfig, InventoryDataset, InventoryRow } from "../types";

interface LocationCategoryLike {
	officeId?: string;
	id?: string;
	description?: string;
}

interface AssignedLocationLike {
	locationId?: string;
	officeId?: string;
	aliasId?: string;
	attribute?: number;
	refLocationId?: string;
}

interface LocationGroupLike {
	officeId?: string;
	id?: string;
	locationCategory?: LocationCategoryLike;
	description?: string;
	sharedLocAliasId?: string;
	sharedRefLocationId?: string;
	locGroupAttribute?: number;
	assignedLocations?: AssignedLocationLike[];
}

const locationGroupColumns: ColumnDefConfig[] = [
	{
		id: "name",
		header: "Category/Group/Location",
		accessorKey: "name",
		group: "Location Groups",
		width: 260,
		defaultVisible: true,
		pinned: true,
	},
	{ id: "office", header: "Office", accessorKey: "office", group: "Location Groups", defaultVisible: true },
	{
		id: "description",
		header: "Description",
		accessorKey: "description",
		group: "Location Groups",
		defaultVisible: true,
	},
	{
		id: "referenceLocation",
		header: "Reference Location",
		accessorKey: "referenceLocation",
		group: "Location Groups",
		defaultVisible: true,
	},
	{ id: "alias", header: "Alias", accessorKey: "alias", group: "Location Groups", defaultVisible: true },
	{
		id: "attribute",
		header: "Attribute",
		accessorKey: "attribute",
		group: "Location Groups",
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

	if (caught instanceof Error) {
		return /\b404\b/.test(caught.message);
	}

	return false;
}

export async function fetchLocationGroupsInventory(): Promise<InventoryDataset> {
	const [categoriesApi, groupsApi] = await Promise.all([
		createCwmsApi<{
			getLocationCategory: (request?: { office?: string }) => Promise<LocationCategoryLike[]>;
		}>("LocationCategoriesApi"),
		createCwmsApi<{
			getLocationGroup: (request: {
				categoryOfficeId: string;
				locationOfficeId: string;
				office?: string;
				includeAssigned?: boolean;
				locationCategoryLike?: string;
			}) => Promise<LocationGroupLike[]>;
		}>("LocationGroupsApi"),
	]);

	if (!categoriesApi || !groupsApi) {
		throw new Error("CWMS location group APIs are unavailable.");
	}

	const { office } = getCdaConfig();
	const normalizedSelectedOffice = normalizeOffice(office);
	const categoryOffices = normalizedSelectedOffice === "CWMS" ? [office] : [office, "CWMS"];
	const categories: LocationCategoryLike[] = [];
	let loadedCategoryPages = 0;
	const categoryErrors: string[] = [];

	for (const categoryOffice of categoryOffices) {
		try {
			const officeCategories = await categoriesApi.getLocationCategory({ office: categoryOffice });
			categories.push(...officeCategories);
			loadedCategoryPages += 1;
		} catch (caught) {
			if (isNotFoundError(caught)) continue;
			const message = caught instanceof Error ? caught.message : "Unknown category load error.";
			categoryErrors.push(`${categoryOffice}: ${message}`);
		}
	}
	const uniqueCategories = new Map<string, LocationCategoryLike>();
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
		const categoryRowId = `loc-category:${categoryOffice}:${categoryId}`;

		rows.push({
			id: categoryRowId,
			kind: "locationGroup",
			label: categoryId,
			name: categoryId,
			office: categoryOffice,
			description: category.description,
			depth: 0,
			selectable: false,
		});

		try {
			const groups = await groupsApi.getLocationGroup({
				categoryOfficeId: categoryOffice,
				locationOfficeId: office,
				office,
				includeAssigned: true,
				locationCategoryLike: categoryId,
			});
			loadedGroupPages += 1;

			const orderedGroups = [...groups]
				.filter((group) => {
					const groupCategoryId = group.locationCategory?.id ?? categoryId;
					const groupOffice = group.officeId ?? office;
					return groupCategoryId === categoryId && normalizeOffice(groupOffice) === normalizeOffice(categoryOffice);
				})
				.sort((left, right) => text(left.id).localeCompare(text(right.id)));

			for (const group of orderedGroups) {
				if (!group.id) continue;
				const groupOffice = group.officeId ?? office;
				const groupRowId = `loc-group:${categoryOffice}:${categoryId}:${groupOffice}:${group.id}`;

				rows.push({
					id: groupRowId,
					parentId: categoryRowId,
					kind: "locationGroup",
					label: group.id,
					name: group.id,
					office: groupOffice,
					description: group.description,
					referenceLocation: group.sharedRefLocationId,
					alias: group.sharedLocAliasId,
					attribute: group.locGroupAttribute,
					depth: 1,
					selectable: false,
				});

				const assigned = [...(group.assignedLocations ?? [])]
					.filter((member) => normalizeOffice(member.officeId) === normalizedSelectedOffice)
					.sort((left, right) => text(left.locationId).localeCompare(text(right.locationId)));

				for (let index = 0; index < assigned.length; index += 1) {
					const member = assigned[index];
					const locationId = member.locationId;
					if (!locationId) continue;

					rows.push({
						id: `loc-member:${groupRowId}:${locationId}:${index}`,
						parentId: groupRowId,
						kind: "locationGroup",
						label: locationId,
						name: locationId,
						office: member.officeId ?? groupOffice,
						alias: member.aliasId,
						attribute: member.attribute,
						referenceLocation: member.refLocationId,
						depth: 2,
						selectable: false,
					});
				}
			}
		} catch (caught) {
			if (isNotFoundError(caught)) continue;
			const message = caught instanceof Error ? caught.message : "Unknown location group error.";
			groupErrors.push(`${categoryId}: ${message}`);
		}
	}

	const allErrors = [...categoryErrors, ...groupErrors];
	if (rows.length === 0 && allErrors.length > 0) {
		throw new Error(`Unable to load location groups. ${allErrors[0]}`);
	}

	return {
		columns: locationGroupColumns,
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
