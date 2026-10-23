"use strict";

const DATA_URL = new URL("./documents.json", window.location.href);
const ALLOWED_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "DD", "DEL", "DIV", "DL", "DT",
  "EM", "H1", "H2", "H3", "H4", "H5", "HR", "I", "LI", "OL",
  "P", "S", "SPAN", "STRONG", "SUB", "SUP", "TABLE", "TBODY",
  "TD", "TFOOT", "TH", "THEAD", "TR", "U", "UL",
]);
const ALLOWED_STYLES = new Set([
  "color", "font-family", "font-size", "font-style", "font-weight",
  "line-height", "margin-left", "text-align", "text-decoration", "text-indent",
]);

const listView = document.querySelector("#list-view");
const detailView = document.querySelector("#detail-view");
const documentList = document.querySelector("#document-list");
const searchInput = document.querySelector("#search-input");
const committeeFilter = document.querySelector("#committee-filter");
const documentCount = document.querySelector("#document-count");
const dataMessage = document.querySelector("#data-message");
const documentSheet = document.querySelector("#document-sheet");
const printButton = document.querySelector("#print-button");
const backLink = document.querySelector("#back-link");

let publishedDocuments = [];

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isPublicRecord(record) {
  return record !== null
    && typeof record === "object"
    && record.status === "APPROVED"
    && record.is_active === true
    && isText(record.document_code)
    && isText(record.title)
    && isText(record.owner_committee)
    && isText(record.version_number)
    && isText(record.approved_by)
    && isValidDate(record.effective_date)
    && isValidDate(record.review_date)
    && Date.parse(`${record.review_date}T00:00:00Z`)
      >= Date.parse(`${record.effective_date}T00:00:00Z`);
}

function showDataError(message) {
  dataMessage.textContent = message;
  dataMessage.hidden = false;
}

function hideDataError() {
  dataMessage.textContent = "";
  dataMessage.hidden = true;
}

function makeTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateString}T00:00:00Z`));
}

function safeStyleValue(property, value) {
  const normalized = value.trim();
  if (!normalized || /url\s*\(|expression\s*\(|javascript:|[<>]/i.test(normalized)) {
    return false;
  }
  if (property === "text-align") {
    return /^(left|right|center|justify)$/i.test(normalized);
  }
  if (property === "font-size" || property === "text-indent" || property === "margin-left") {
    return /^-?\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i.test(normalized);
  }
  if (property === "line-height") {
    return /^\d+(?:\.\d+)?(?:px|pt|em|rem|%)?$/.test(normalized);
  }
  if (property === "font-weight") {
    return /^(normal|bold|[1-9]00)$/i.test(normalized);
  }
  if (property === "font-style") {
    return /^(normal|italic|oblique)$/i.test(normalized);
  }
  if (property === "text-decoration") {
    return /^(none|underline|line-through|overline)(\s+(underline|line-through|overline))*$/i.test(normalized);
  }
  if (property === "color") {
    return /^#[\da-f]{3,8}$|^[a-z]{3,20}$/i.test(normalized);
  }
  if (property === "font-family") {
    return /^[\w\s"',-]{1,100}$/.test(normalized);
  }
  return false;
}

function safeHref(value) {
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:") {
      return url.href;
    }
  } catch {
    return "";
  }
  return "";
}

function appendSanitizedNode(sourceNode, targetParent) {
  if (sourceNode.nodeType === Node.TEXT_NODE) {
    targetParent.append(document.createTextNode(sourceNode.nodeValue ?? ""));
    return;
  }
  if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;

  const sourceElement = sourceNode;
  if (!ALLOWED_TAGS.has(sourceElement.tagName)) {
    for (const child of sourceElement.childNodes) appendSanitizedNode(child, targetParent);
    return;
  }

  const cleanElement = document.createElement(sourceElement.tagName.toLowerCase());
  if (sourceElement.tagName === "A") {
    const href = safeHref(sourceElement.getAttribute("href") ?? "");
    if (href) {
      cleanElement.setAttribute("href", href);
      cleanElement.setAttribute("rel", "noopener noreferrer");
    }
    const title = sourceElement.getAttribute("title");
    if (title) cleanElement.setAttribute("title", title.slice(0, 200));
  }

  const style = sourceElement.getAttribute("style");
  if (style) {
    for (const declaration of style.split(";")) {
      const separator = declaration.indexOf(":");
      if (separator < 1) continue;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (ALLOWED_STYLES.has(property) && safeStyleValue(property, value)) {
        cleanElement.style.setProperty(property, value);
      }
    }
  }
  targetParent.append(cleanElement);
  for (const child of sourceElement.childNodes) appendSanitizedNode(child, cleanElement);
}

function renderSafeBody(html) {
  const fragment = document.createDocumentFragment();
  if (!isText(html)) return fragment;
  const source = new DOMParser().parseFromString(html, "text/html");
  for (const child of source.body.childNodes) appendSanitizedNode(child, fragment);
  return fragment;
}

function populateCommitteeFilter() {
  const committees = [...new Set(publishedDocuments.map((item) => item.owner_committee))]
    .sort((a, b) => a.localeCompare(b));
  for (const name of committees) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    committeeFilter.append(option);
  }
}

function renderDocumentList() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const committee = committeeFilter.value;
  const filtered = publishedDocuments.filter((document) => {
    const matchesCommittee = !committee || document.owner_committee === committee;
    const searchable = [
      document.document_code,
      document.title,
      document.owner_committee,
      document.county ?? "",
      document.sub_county ?? "",
    ].join(" ").toLocaleLowerCase();
    return matchesCommittee && (!query || searchable.includes(query));
  });

  documentList.replaceChildren();
  documentCount.textContent = `${filtered.length} approved ${filtered.length === 1 ? "document" : "documents"}`;
  if (filtered.length === 0) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    const heading = makeTextElement(
      "h2",
      "",
      publishedDocuments.length ? "No matching documents" : "No documents have been published",
    );
    const message = makeTextElement(
      "p",
      "",
      publishedDocuments.length
        ? "Try a different title, code, county, or committee."
        : "The public catalogue is ready. Approved documents will appear here when added to documents.json.",
    );
    empty.append(heading, message);
    documentList.append(empty);
    return;
  }

  for (const document of filtered) documentList.append(createDocumentCard(document));
}

function createDocumentCard(record) {
  const card = document.createElement("article");
  card.className = "document-card";
  card.append(makeTextElement("div", "document-code", record.document_code));

  const summary = document.createElement("div");
  const title = document.createElement("a");
  title.className = "document-title";
  title.href = `#document=${encodeURIComponent(record.document_code)}`;
  title.textContent = record.title;
  const meta = document.createElement("div");
  meta.className = "document-meta";
  meta.append(
    makeTextElement("span", "", record.owner_committee),
    makeTextElement("span", "", [record.county, record.sub_county].filter(isText).join(" / ") || "GHC-E"),
    makeTextElement("span", "", `Version ${record.version_number}`),
  );
  summary.append(title, meta);

  const review = document.createElement("div");
  review.className = "review-meta";
  review.append(
    makeTextElement("strong", "", "Next review"),
    makeTextElement("span", "", formatDate(record.review_date)),
  );
  card.append(summary, review);
  return card;
}

function appendControlRow(tableBody, label, value, secondLabel, secondValue) {
  const row = document.createElement("tr");
  for (const [heading, content] of [
    [label, value],
    [secondLabel, secondValue],
  ]) {
    const th = makeTextElement("th", "", heading);
    th.scope = "row";
    row.append(th, makeTextElement("td", "", content || "—"));
  }
  tableBody.append(row);
}

function renderDocumentDetail(documentRecord) {
  documentSheet.replaceChildren();

  const letterhead = document.createElement("header");
  letterhead.className = "document-letterhead";
  letterhead.append(
    makeTextElement("h2", "", "GLOCAL HEALTHCARE CENTRE OF EXCELLENCE (GHC-E)"),
    makeTextElement("p", "", "Global Standards, Local Care"),
    makeTextElement("p", "control-label", "DOCUMENT CONTROL"),
  );

  const table = document.createElement("table");
  table.className = "control-table";
  const tbody = document.createElement("tbody");
  appendControlRow(tbody, "Document code", documentRecord.document_code, "Version", documentRecord.version_number);
  appendControlRow(tbody, "Title", documentRecord.title, "Facility level", documentRecord.facility_level || "Level 3B");
  appendControlRow(tbody, "County", documentRecord.county, "Sub-county", documentRecord.sub_county);
  appendControlRow(tbody, "Owner committee", documentRecord.owner_committee, "Status", "Approved");
  appendControlRow(tbody, "Effective date", formatDate(documentRecord.effective_date), "Review date", formatDate(documentRecord.review_date));
  appendControlRow(tbody, "Approved by", documentRecord.approved_by, "Approval", "Approved");
  table.append(tbody);

  const body = document.createElement("section");
  body.className = "document-body";
  body.append(renderSafeBody(documentRecord.body_html));
  documentSheet.append(letterhead, table, body);

  const history = (Array.isArray(documentRecord.history) ? documentRecord.history : [])
    .filter((version) => version && version.status === "APPROVED");
  if (history.length) {
    const section = document.createElement("section");
    section.className = "version-history";
    section.append(makeTextElement("h2", "", "Approved version history"));
    const list = document.createElement("ul");
    for (const version of history) {
      if (!isText(version.version_number) || !isValidDate(version.effective_date)) continue;
      const title = isText(version.title) ? ` — ${version.title}` : "";
      list.append(makeTextElement("li", "", `Version ${version.version_number}${title}; effective ${formatDate(version.effective_date)}`));
    }
    if (list.childElementCount) {
      section.append(list);
      documentSheet.append(section);
    }
  }
}

function showCurrentRoute() {
  const match = window.location.hash.match(/^#document=(.*)$/);
  if (!match) {
    detailView.hidden = true;
    listView.hidden = false;
    documentSheet.replaceChildren();
    document.title = "Policies and SOPs | GHC-E";
    return;
  }

  let code = "";
  try {
    code = decodeURIComponent(match[1]);
  } catch {
    window.location.hash = "";
    return;
  }
  const record = publishedDocuments.find((item) => item.document_code === code);
  if (!record) {
    window.location.hash = "";
    showDataError("That document is not in the published approved-document catalogue.");
    return;
  }

  hideDataError();
  renderDocumentDetail(record);
  listView.hidden = true;
  detailView.hidden = false;
  document.title = `${record.document_code} | GHC-E`;
  window.scrollTo(0, 0);
}

async function loadDocuments() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`The document data request returned HTTP ${response.status}.`);
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error("documents.json must contain a JSON array.");
    publishedDocuments = records.filter(isPublicRecord);
    populateCommitteeFilter();
    renderDocumentList();
    showCurrentRoute();
    if (publishedDocuments.length !== records.length) {
      showDataError("Some document entries were omitted because they are incomplete, not approved, inactive, or have invalid dates.");
    }
  } catch (error) {
    publishedDocuments = [];
    documentCount.textContent = "Catalogue unavailable";
    documentList.replaceChildren();
    showDataError("The approved-document catalogue could not be loaded. Please try again later.");
    console.error("Unable to load the public document catalogue:", error);
  }
}

searchInput.addEventListener("input", renderDocumentList);
committeeFilter.addEventListener("change", renderDocumentList);
window.addEventListener("hashchange", showCurrentRoute);
printButton.addEventListener("click", () => window.print());
backLink.addEventListener("click", (event) => {
  event.preventDefault();
  window.location.hash = "";
});

loadDocuments();
