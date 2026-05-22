import { getCdaConfig, createCwmsApi, cdaFetch } from "../api/cdaClient";
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

interface RatingPointLike {
	ind?: string | number;
	dep?: string | number;
	["ind"]?: string | number;
	["dep"]?: string | number;
}

interface RatingPointsGroupLike {
	otherInd?: {
		position?: string | number;
		value?: string | number;
	};
	point?: RatingPointLike[];
	["other-ind"]?: {
		position?: string | number;
		value?: string | number;
	};
}

interface SimpleRatingLike {
	officeId?: string;
	ratingSpecId?: string;
	unitsId?: string;
	effectiveDate?: string;
	createDate?: string;
	active?: boolean | string;
	description?: string;
	ratingPoints?: RatingPointsGroupLike[];
	["office-id"]?: string;
	["rating-spec-id"]?: string;
	["units-id"]?: string;
	["effective-date"]?: string;
	["create-date"]?: string;
	["rating-points"]?: RatingPointsGroupLike[];
}

interface RetrievedRatingsLike {
	simpleRating?: SimpleRatingLike[];
	["simple-rating"]?: SimpleRatingLike[];
}

export interface RatingEffectiveDatePoint {
	index: number;
	otherIndependentPosition: string;
	otherIndependentValue: string;
	independentValue: string;
	dependentValue: string;
}

export interface RatingEffectiveDateEditorData {
	officeId: string;
	ratingSpecId: string;
	unitsId: string;
	effectiveDate: string;
	createDate: string;
	active: boolean;
	description: string;
	points: RatingEffectiveDatePoint[];
	raw: unknown;
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

function toIsoDateTime(value: Date | string): string | undefined {
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.valueOf())) return undefined;
	return parsed.toISOString();
}

function normalizeDateKey(value: string | undefined): string {
	if (!value) return "";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.valueOf())) return value.trim();
	return parsed.toISOString();
}

function asString(value: unknown): string {
	if (value === undefined || value === null) return "";
	return String(value);
}

function asBoolean(value: unknown): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") return value.toLowerCase() === "true";
	return Boolean(value);
}

function getElementLocalName(element: Element): string {
	return element.localName || element.tagName;
}

function getDirectChildrenByName(parent: Element, name: string): Element[] {
	const children = Array.from(parent.children);
	return children.filter((child) => getElementLocalName(child) === name);
}

function getFirstDirectChild(parent: Element, name: string): Element | undefined {
	return getDirectChildrenByName(parent, name)[0];
}

function getFirstDirectChildText(parent: Element, name: string): string | undefined {
	const child = getFirstDirectChild(parent, name);
	const value = child?.textContent?.trim();
	return value ? value : undefined;
}

function parseXmlSimpleRatings(xmlText: string): SimpleRatingLike[] {
	if (!xmlText.trim().startsWith("<")) return [];

	const document = new DOMParser().parseFromString(xmlText, "application/xml");
	if (document.getElementsByTagName("parsererror").length > 0) return [];

	const allElements = Array.from(document.getElementsByTagName("*"));
	const simpleRatingElements = allElements.filter((element) => getElementLocalName(element) === "simple-rating");

	return simpleRatingElements.map((simpleRatingElement) => {
		const ratingPointsGroups: RatingPointsGroupLike[] = [];
		for (const ratingPointsElement of getDirectChildrenByName(simpleRatingElement, "rating-points")) {
			const otherIndElement = getFirstDirectChild(ratingPointsElement, "other-ind");
			const otherInd = otherIndElement
				? {
					position: otherIndElement.getAttribute("position") ?? undefined,
					value: getFirstDirectChildText(otherIndElement, "value") ?? otherIndElement.getAttribute("value") ?? undefined,
				}
				: undefined;

			const points = getDirectChildrenByName(ratingPointsElement, "point").map((pointElement) => ({
				ind: getFirstDirectChildText(pointElement, "ind") ?? "",
				dep: getFirstDirectChildText(pointElement, "dep") ?? "",
			}));

			if (points.length > 0) {
				ratingPointsGroups.push({
					otherInd,
					point: points,
				});
			}
		}

		return {
			["office-id"]: simpleRatingElement.getAttribute("office-id") ?? undefined,
			["rating-spec-id"]: getFirstDirectChildText(simpleRatingElement, "rating-spec-id"),
			["units-id"]: getFirstDirectChildText(simpleRatingElement, "units-id"),
			["effective-date"]: getFirstDirectChildText(simpleRatingElement, "effective-date"),
			["create-date"]: getFirstDirectChildText(simpleRatingElement, "create-date"),
			active: getFirstDirectChildText(simpleRatingElement, "active"),
			description: getFirstDirectChildText(simpleRatingElement, "description"),
			["rating-points"]: ratingPointsGroups,
		};
	});
}

function pickSimpleRatings(response: unknown): SimpleRatingLike[] {
	if (typeof response === "string") {
		return parseXmlSimpleRatings(response);
	}

	if (response instanceof Document) {
		const serialized = new XMLSerializer().serializeToString(response);
		return parseXmlSimpleRatings(serialized);
	}

	if (!response || typeof response !== "object") return [];
	const container = response as RetrievedRatingsLike;
	if (Array.isArray(container.simpleRating)) return container.simpleRating;
	if (Array.isArray(container["simple-rating"])) return container["simple-rating"];
	return [];
}

function flattenRatingPoints(pointsGroups: RatingPointsGroupLike[] | undefined): RatingEffectiveDatePoint[] {
	if (!pointsGroups?.length) return [];
	const flattened: RatingEffectiveDatePoint[] = [];
	let pointIndex = 1;

	for (const group of pointsGroups) {
		const otherInd = group.otherInd ?? group["other-ind"];
		const otherIndependentPosition = asString(otherInd?.position);
		const otherIndependentValue = asString(otherInd?.value);
		for (const point of group.point ?? []) {
			flattened.push({
				index: pointIndex,
				otherIndependentPosition,
				otherIndependentValue,
				independentValue: asString(point.ind),
				dependentValue: asString(point.dep),
			});
			pointIndex += 1;
		}
	}

	return flattened;
}

async function retrieveRatingsPayload(
	ratingId: string,
	office?: string,
	effectiveDate?: string,
) {
	const normalizedRatingId = ratingId.trim();
	if (!normalizedRatingId) {
		throw new Error("Rating identifier is required to retrieve effective-date data.");
	}

	const normalizedOffice = office?.trim();
	if (!normalizedOffice) {
		throw new Error("Office is required to retrieve rating effective-date data.");
	}

	const payload = await retrieveRatingsPayloadViaHttp(normalizedRatingId, normalizedOffice, effectiveDate);
	if (payload === undefined) throw new Error("No rating payload returned from CDA.");
	return payload;
}

async function retrieveRatingsPayloadViaHttp(
	ratingId: string,
	office?: string,
	effectiveDate?: string,
): Promise<unknown | undefined> {
	const { baseUrl } = getCdaConfig();
	if (!office) return undefined;

	const endpoint = new URL(`ratings/${encodeURIComponent(ratingId)}`, `${baseUrl.replace(/\/$/, "")}/`);
	endpoint.searchParams.set("office", office);
	if (effectiveDate) {
		endpoint.searchParams.set("begin", effectiveDate);
		endpoint.searchParams.set("end", effectiveDate);
	}

	const response = await cdaFetch(endpoint.toString());
	if (!response.ok) {
		throw new Error(`Rating query failed (${response.status} ${response.statusText}).`);
	}

	const text = await response.text();
	if (!text.trim()) return undefined;

	const trimmed = text.trim();
	if (trimmed.startsWith("<")) return trimmed;
	try {
		return JSON.parse(trimmed);
	} catch {
		return trimmed;
	}

	return undefined;
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
					const iso = toIsoDateTime(effectiveDate);
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
						effectiveDate: iso ?? asString(effectiveDate),
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

export async function fetchRatingEffectiveDateEditorData(
	ratingId: string,
	effectiveDate: string,
	officeOverride?: string,
): Promise<RatingEffectiveDateEditorData> {
	const normalizedRatingId = ratingId.trim();
	if (!normalizedRatingId) {
		throw new Error("Rating identifier is missing for this effective-date row.");
	}

	const { office } = getCdaConfig();
	const payload = await retrieveRatingsPayload(normalizedRatingId, officeOverride ?? office, effectiveDate);
	const simpleRatings = pickSimpleRatings(payload);
	const effectiveDateKey = normalizeDateKey(effectiveDate);
	const matching =
		simpleRatings.find((candidate) => normalizeDateKey(candidate.effectiveDate ?? candidate["effective-date"]) === effectiveDateKey) ??
		simpleRatings[0];

	if (!matching) {
		throw new Error("No rating payload returned for this effective date.");
	}

	return {
		officeId: asString(matching.officeId ?? matching["office-id"]),
		ratingSpecId: asString(matching.ratingSpecId ?? matching["rating-spec-id"] ?? normalizedRatingId),
		unitsId: asString(matching.unitsId ?? matching["units-id"]),
		effectiveDate: asString(matching.effectiveDate ?? matching["effective-date"] ?? effectiveDate),
		createDate: asString(matching.createDate ?? matching["create-date"]),
		active: asBoolean(matching.active),
		description: asString(matching.description),
		points: flattenRatingPoints(matching.ratingPoints ?? matching["rating-points"]),
		raw: payload,
	};
}
