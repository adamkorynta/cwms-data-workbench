import { getCdaConfig, createCwmsApi } from "../api/cdaClient";
import { ratingsDataset } from "../data/mockData";
import type { InventoryDataset, InventoryRow } from "../types";
import { enrichTimeSeriesRowWithLocationMetadata, fetchLocationMetadataById } from "./locationMetadataService";

interface RatingTemplateLike {
	officeId?: string;
	id?: string;
	version?: string;
	description?: string;
	dependentParameter?: string;
	independentParameterSpecs?: Array<{
		parameter?: string;
		parameterName?: string;
		parameterId?: string;
		name?: string;
		inRangeMethod?: string;
		outRangeLowMethod?: string;
		outRangeHighMethod?: string;
		parameterType?: string;
		unit?: string;
	}>;
	ratingIds?: string[];
}

interface RatingTemplatesLike {
	templates?: RatingTemplateLike[];
	nextPage?: string;
	total?: number;
}

interface RatingSpecLike {
	officeId?: string;
	ratingId?: string;
	templateId?: string;
	locationId?: string;
	version?: string;
	sourceAgency?: string;
	inRangeMethod?: string;
	outRangeLowMethod?: string;
	outRangeHighMethod?: string;
	active?: boolean;
	autoUpdate?: boolean;
	description?: string;
	effectiveDates?: Array<Date | string>;
	independentRoundingSpecs?: Array<{
		position?: number;
		value?: string;
	}>;
}

interface RatingSpecsLike {
	specs?: RatingSpecLike[];
	nextPage?: string;
	total?: number;
}

const ROOT_TEMPLATES_ID = "ratings-root:templates";
const ROOT_SPECS_ID = "ratings-root:specs";

function parseRatingIdParts(ratingId: string) {
	const [location = "", parameters = "", templateVersion = "", specVersion = ""] = ratingId.split(".");
	const [independent = "", dependent = ""] = parameters.split(";");
	return {
		location,
		independent,
		dependent,
		templateVersion,
		specVersion,
	};
}

function formatEffectiveDate(value: Date | string): string {
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.valueOf())) return String(value);
	const iso = parsed.toISOString();
	return iso.replace("T", " ").replace(".000Z", "");
}

function mapIndependentParameterColumns(
	specs: Array<{
		parameter?: string;
		parameterName?: string;
		parameterId?: string;
		name?: string;
		inRangeMethod?: string;
		outRangeLowMethod?: string;
		outRangeHighMethod?: string;
	}>,
	roundingByPosition: Map<number, string> = new Map<number, string>(),
) {
	const columns: Record<string, string> = {};
	for (let index = 0; index < 5; index += 1) {
		const spec = specs[index];
		const columnIndex = index + 1;
		columns[`ip${columnIndex}Name`] = spec?.parameter ?? spec?.parameterName ?? spec?.parameterId ?? spec?.name ?? "";
		columns[`ip${columnIndex}InRange`] = spec?.inRangeMethod ?? "";
		columns[`ip${columnIndex}OutLow`] = spec?.outRangeLowMethod ?? "";
		columns[`ip${columnIndex}OutHigh`] = spec?.outRangeHighMethod ?? "";
		columns[`ip${columnIndex}Rounding`] = roundingByPosition.get(columnIndex) ?? "";
	}
	return columns;
}

async function fetchAllPages<TPage extends { nextPage?: string }, TItem>(
	fetchPage: (page: string | undefined) => Promise<TPage>,
	pickItems: (page: TPage) => TItem[] | undefined,
) {
	const rows: TItem[] = [];
	let page: string | undefined;
	let pagesLoaded = 0;
	let total: number | undefined;

	do {
		const response = await fetchPage(page);
		rows.push(...(pickItems(response) ?? []));
		total = (response as { total?: number }).total ?? total;
		page = response.nextPage;
		pagesLoaded += 1;
	} while (page);

	return { rows, pagesLoaded, total: total ?? rows.length };
}

function mapTemplateRows(templates: RatingTemplateLike[]): InventoryRow[] {
	return templates
		.filter((template) => Boolean(template.id))
		.map((template) => {
			const templateId = String(template.id);
			const independentSpecs = template.independentParameterSpecs ?? [];
			const independent = independentSpecs
				.map((spec) => spec.parameter ?? spec.parameterName ?? spec.parameterId ?? spec.name ?? "")
				.filter(Boolean)
				.join(", ");
			const independentColumns = mapIndependentParameterColumns(independentSpecs);
			return {
				id: `rating-template:${template.officeId ?? ""}:${templateId}`,
				kind: "rating" as const,
				label: templateId,
				parentId: ROOT_TEMPLATES_ID,
				depth: 1,
				selectable: false,
				ratingCurve: templateId,
				office: template.officeId,
				version: template.version,
				description: template.description,
				independent,
				dependent: template.dependentParameter,
				...independentColumns,
			};
		})
		.sort((left, right) => String(left.ratingCurve ?? "").localeCompare(String(right.ratingCurve ?? "")));
}

function enrichRatingRowsWithLocationMetadata(rows: InventoryRow[], locationMetadataById: Map<string, unknown>): InventoryRow[] {
	return rows.map((row) => {
		const location = typeof row.location === "string" ? row.location : "";
		if (!location) return row;
		const metadata = locationMetadataById.get(location);
		if (!metadata) return row;
		return enrichTimeSeriesRowWithLocationMetadata(row, metadata as Parameters<typeof enrichTimeSeriesRowWithLocationMetadata>[1]);
	});
}

function mapSpecRows(
	specs: RatingSpecLike[],
	templateById: Map<string, RatingTemplateLike>,
): InventoryRow[] {
	return specs
		.filter((spec) => Boolean(spec.ratingId))
		.flatMap((spec) => {
			const ratingId = String(spec.ratingId);
			const parts = parseRatingIdParts(ratingId);
			const template = spec.templateId ? templateById.get(spec.templateId) : undefined;
			const independentSpecs = template?.independentParameterSpecs ?? [];
			const roundingByPosition = new Map<number, string>();
			for (const roundingSpec of spec.independentRoundingSpecs ?? []) {
				const position = roundingSpec.position;
				if (!position || !roundingSpec.value) continue;
				roundingByPosition.set(position, roundingSpec.value);
			}
			const independentColumns = mapIndependentParameterColumns(independentSpecs, roundingByPosition);
			const independent = independentSpecs
				.map((independentSpec) =>
					independentSpec.parameter ?? independentSpec.parameterName ?? independentSpec.parameterId ?? independentSpec.name ?? "",
				)
				.filter(Boolean)
				.join(", ");
			const specRow: InventoryRow = {
				id: `rating-spec:${spec.officeId ?? ""}:${ratingId}`,
				kind: "rating" as const,
				label: ratingId,
				parentId: ROOT_SPECS_ID,
				depth: 1,
				ratingCurve: ratingId,
				ratingId,
				nodeType: "rating-spec",
				office: spec.officeId,
				location: spec.locationId ?? parts.location,
				independent: independent || parts.independent,
				dependent: parts.dependent,
				templateVersion: parts.templateVersion,
				version: spec.version ?? parts.specVersion,
				description: spec.description,
				active: spec.active,
				sourceAgency: spec.sourceAgency,
				autoUpdate: spec.autoUpdate,
				inRange: spec.inRangeMethod,
				outLow: spec.outRangeLowMethod,
				outHigh: spec.outRangeHighMethod,
				...independentColumns,
			};

			const effectiveDateRows: InventoryRow[] = (spec.effectiveDates ?? [])
				.map((effectiveDate) => {
					const display = formatEffectiveDate(effectiveDate);
					return {
						id: `rating-effective:${specRow.id}:${display}`,
						parentId: specRow.id,
						kind: "rating" as const,
						label: display,
						depth: 2,
						ratingCurve: display,
						office: specRow.office,
						ratingId,
						location: specRow.location,
						independent: specRow.independent,
						dependent: specRow.dependent,
						selectable: false,
						nodeType: "rating-effective-date",
					};
				})
				.sort((left, right) => String(right.label).localeCompare(String(left.label)));

			return [specRow, ...effectiveDateRows];
		})
		.sort((left, right) => String(left.ratingCurve ?? "").localeCompare(String(right.ratingCurve ?? "")));
}

export async function fetchRatingsInventory(): Promise<InventoryDataset> {
	const ratingsApi = await createCwmsApi<{
		getRatingsTemplate: (request?: { office?: string; page?: string; pageSize?: number }) => Promise<RatingTemplatesLike>;
		getRatingsSpec: (request?: { office?: string; page?: string; pageSize?: number }) => Promise<RatingSpecsLike>;
	}>("RatingsApi");

	if (!ratingsApi) {
		throw new Error("CWMS ratings API is unavailable.");
	}

	const { office } = getCdaConfig();

	const [templatesResult, specsResult, locationMetadataById] = await Promise.all([
		fetchAllPages(
			(page) => ratingsApi.getRatingsTemplate({ office, page, pageSize: 500 }),
			(response) => response.templates,
		),
		fetchAllPages(
			(page) => ratingsApi.getRatingsSpec({ office, page, pageSize: 500 }),
			(response) => response.specs,
		),
		fetchLocationMetadataById(),
	]);

	const templateById = new Map(
		templatesResult.rows
			.filter((template) => Boolean(template.id))
			.map((template) => [String(template.id), template] as const),
	);
	const templateRows = mapTemplateRows(templatesResult.rows);
	const specRows = enrichRatingRowsWithLocationMetadata(
		mapSpecRows(specsResult.rows, templateById),
		locationMetadataById,
	);

	const rows: InventoryRow[] = [
		{ id: ROOT_TEMPLATES_ID, kind: "rating", label: "Template", ratingCurve: "Template", depth: 0, selectable: false },
		{ id: ROOT_SPECS_ID, kind: "rating", label: "Rating Specifications", ratingCurve: "Rating Specifications", depth: 0, selectable: false },
		...templateRows,
		...specRows,
	];

	return {
		columns: ratingsDataset.columns,
		rows,
		pageInfo: {
			pagesLoaded: templatesResult.pagesLoaded + specsResult.pagesLoaded,
			totalRows: rows.length,
			pageSize: 500,
			exhausted: true,
			partial: false,
		},
	};
}
