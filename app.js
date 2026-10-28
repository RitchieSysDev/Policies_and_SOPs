"use strict";

const DATA_URL = new URL("./documents.json", window.location.href);
const LOCAL_STORAGE_KEY = "ghce-sop-local-documents-v1";
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
const editorView = document.querySelector("#editor-view");
const documentList = document.querySelector("#document-list");
const searchInput = document.querySelector("#search-input");
const committeeFilter = document.querySelector("#committee-filter");
const documentCount = document.querySelector("#document-count");
const dataMessage = document.querySelector("#data-message");
const documentSheet = document.querySelector("#document-sheet");
const printButton = document.querySelector("#print-button");
const backLink = document.querySelector("#back-link");
const createButton = document.querySelector("#create-button");
const exportButton = document.querySelector("#export-button");
const cancelEditorButton = document.querySelector("#cancel-editor-button");
const editButton = document.querySelector("#edit-button");
const documentForm = document.querySelector("#document-form");
const editorMessage = document.querySelector("#editor-message");

let documents = [];
let currentDetailCode = "";
let editorSource = null;
let savedEditorRange = null;

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidRecord(record) {
  return record !== null
    && typeof record === "object"
    && isText(record.document_code)
    && isText(record.title)
    && isText(record.owner_committee)
    && isText(record.version_number)
    && ["DRAFT", "APPROVED", "ARCHIVED"].includes(record.status)
    && typeof record.is_active === "boolean"
    && (record.status !== "APPROVED" || record.is_active)
    && (record.status === "APPROVED" || !record.is_active)
    && (record.status !== "APPROVED" || isText(record.approved_by))
    && (!record.approval_date || isValidDate(record.approval_date))
    && isValidDate(record.effective_date)
    && isValidDate(record.review_date)
    && Date.parse(`${record.review_date}T00:00:00Z`)
      >= Date.parse(`${record.effective_date}T00:00:00Z`)
    && typeof record.body_html === "string";
}

function isPublicRecord(record) {
  return isValidRecord(record)
    && record.status === "APPROVED"
    && record.is_active === true;
}

function currentRecords() {
  const grouped = new Map();
  for (const record of documents) {
    if (!isValidRecord(record) || record.status === "ARCHIVED") continue;
    const records = grouped.get(record.document_code) ?? [];
    records.push(record);
    grouped.set(record.document_code, records);
  }
  const current = [];
  for (const records of grouped.values()) {
    const drafts = records
      .filter((record) => record.status === "DRAFT")
      .sort((a, b) => compareVersions(b.version_number, a.version_number));
    const active = records.find(
      (record) => record.status === "APPROVED" && record.is_active,
    );
    if (drafts.length) current.push(drafts[0]);
    else if (active) current.push(active);
  }
  return current.sort((a, b) => a.document_code.localeCompare(b.document_code));
}

function compareVersions(first, second) {
  const firstParts = String(first).split(".").map(Number);
  const secondParts = String(second).split(".").map(Number);
  for (let index = 0; index < Math.max(firstParts.length, secondParts.length); index += 1) {
    const difference = (firstParts[index] ?? 0) - (secondParts[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function showDataError(message) {
  dataMessage.textContent = message;
  dataMessage.hidden = false;
}

function hideDataError() {
  dataMessage.textContent = "";
  dataMessage.hidden = true;
}

function showEditorMessage(message) {
  editorMessage.textContent = message;
  editorMessage.hidden = false;
}

function hideEditorMessage() {
  editorMessage.textContent = "";
  editorMessage.hidden = true;
}

function persistDocuments() {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(documents));
    return true;
  } catch (error) {
    console.error("Unable to save local document changes:", error);
    showDataError("Changes could not be saved in this browser. Check available storage and try again.");
    return false;
  }
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
    return /^#[\da-f]{3,8}$|^[a-z]{3,20}$|^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(normalized);
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
  const previousValue = committeeFilter.value;
  const committees = [...new Set(currentRecords().map((item) => item.owner_committee))]
    .sort((a, b) => a.localeCompare(b));
  committeeFilter.replaceChildren(new Option("All owners", ""));
  for (const name of committees) {
    committeeFilter.append(new Option(name, name));
  }
  committeeFilter.value = committees.includes(previousValue) ? previousValue : "";
}

function renderDocumentList() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const committee = committeeFilter.value;
  const current = currentRecords();
  const filtered = current.filter((record) => {
    const matchesCommittee = !committee || record.owner_committee === committee;
    const searchable = [
      record.document_code,
      record.title,
      record.owner_committee,
      record.county ?? "",
      record.sub_county ?? "",
    ].join(" ").toLocaleLowerCase();
    return matchesCommittee && (!query || searchable.includes(query));
  });

  documentList.replaceChildren();
  const draftCount = filtered.filter((record) => record.status === "DRAFT").length;
  const approvedCount = filtered.length - draftCount;
  documentCount.textContent = `${approvedCount} approved · ${draftCount} local ${draftCount === 1 ? "draft" : "drafts"}`;
  if (filtered.length === 0) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    const heading = makeTextElement(
      "h2",
      "",
      current.length ? "No matching documents" : "No documents have been published",
    );
    const message = makeTextElement(
      "p",
      "",
      current.length
        ? "Try a different title, code, county, or owner."
        : "Create a local SOP or policy draft, or add approved records to documents.json.",
    );
    empty.append(heading, message);
    documentList.append(empty);
    return;
  }

  for (const record of filtered) documentList.append(createDocumentCard(record));
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
  summary.append(title);
  if (record.status === "DRAFT") {
    const badge = makeTextElement("span", "status-badge status-draft", "Local draft");
    summary.append(badge);
  }
  const meta = document.createElement("div");
  meta.className = "document-meta";
  meta.append(
    makeTextElement("span", "", record.owner_committee),
    makeTextElement("span", "", [record.county, record.sub_county].filter(isText).join(" / ") || "GHC-E"),
    makeTextElement("span", "", `Version ${record.version_number}`),
  );
  summary.append(meta);

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
  appendControlRow(
    tbody,
    "Owner (Committee or Department)",
    documentRecord.owner_committee,
    "Status",
    documentRecord.status === "DRAFT" ? "Local draft — not approved" : "Approved",
  );
  appendControlRow(tbody, "Effective date", formatDate(documentRecord.effective_date), "Review date", formatDate(documentRecord.review_date));
  appendControlRow(
    tbody,
    documentRecord.status === "DRAFT" ? "Proposed approver" : "Approved by",
    documentRecord.approved_by,
    "Designation",
    documentRecord.approver_designation,
  );
  appendControlRow(
    tbody,
    "Date of approval",
    documentRecord.approval_date ? formatDate(documentRecord.approval_date) : "—",
    "Approval",
    documentRecord.status === "DRAFT" ? "Pending" : "Approved",
  );
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

  if (documentRecord.status === "DRAFT") {
    const warning = makeTextElement(
      "p",
      "draft-warning",
      "This is an unapproved draft saved only in this browser. It is not part of the public published catalogue.",
    );
    documentSheet.prepend(warning);
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
  const record = currentRecords().find((item) => item.document_code === code);
  if (!record) {
    window.location.hash = "";
    showDataError("That document is not in the published approved-document catalogue.");
    return;
  }

  hideDataError();
  renderDocumentDetail(record);
  currentDetailCode = record.document_code;
  editButton.textContent = record.status === "DRAFT" ? "Edit draft" : "Edit / revise";
  listView.hidden = true;
  editorView.hidden = true;
  detailView.hidden = false;
  document.title = `${record.document_code} | GHC-E`;
  window.scrollTo(0, 0);
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextVersion(version) {
  const current = Number.parseFloat(version);
  if (!Number.isFinite(current) || current < 0) return "1.0";
  return ((Math.round(current * 10) + 1) / 10).toFixed(1);
}

function versionHistorySnapshot(record) {
  return {
    version_number: record.version_number,
    title: record.title,
    effective_date: record.effective_date,
    status: "APPROVED",
  };
}

function openEditor(record = null) {
  hideEditorMessage();
  editorSource = record;
  const sourceCode = record?.document_code ?? "";
  document.querySelector("#edit-original-code").value = sourceCode;
  document.querySelector("#field-document-code").value = sourceCode;
  document.querySelector("#field-document-code").readOnly = Boolean(record);
  document.querySelector("#field-version").value = record
    ? record.version_number
    : "1.0";
  document.querySelector("#field-title").value = record?.title ?? "";
  const ownerSelect = document.querySelector("#field-committee");
  ownerSelect.querySelector(".legacy-owner-option")?.remove();
  const owner = record?.owner_committee ?? "";
  if (owner && ![...ownerSelect.options].some((option) => option.value === owner)) {
    const legacyOwners = document.createElement("optgroup");
    legacyOwners.className = "legacy-owner-option";
    legacyOwners.label = "Existing owner (legacy)";
    const legacyOwner = document.createElement("option");
    legacyOwner.value = owner;
    legacyOwner.textContent = owner;
    legacyOwners.append(legacyOwner);
    ownerSelect.append(legacyOwners);
  }
  ownerSelect.value = owner;
  document.querySelector("#field-facility-level").value = record?.facility_level || "Level 3B";
  document.querySelector("#field-county").value = record?.county ?? "";
  document.querySelector("#field-sub-county").value = record?.sub_county ?? "";
  document.querySelector("#field-effective-date").value = record?.effective_date
    ?? localDateString(new Date());
  document.querySelector("#field-review-date").value = record?.review_date
    ?? localDateString(new Date(new Date().setFullYear(new Date().getFullYear() + 1)));
  document.querySelector("#field-approved-by").value = record?.approved_by ?? "";
    document.querySelector("#field-approver-designation").value = record?.approver_designation ?? "";
  document.querySelector("#field-body").value = record?.body_html ?? "";
  const bodyEditor = document.querySelector("#field-body-editor");
  bodyEditor.replaceChildren(renderSafeBody(record?.body_html ?? ""));
  savedEditorRange = null;
  document.querySelector("#editor-title").textContent = record
    ? record.status === "DRAFT"
      ? `Edit draft — ${record.document_code}`
      : `Revise approved document — ${record.document_code}`
    : "Create SOP / Policy";
  listView.hidden = true;
  detailView.hidden = true;
  editorView.hidden = false;
  window.scrollTo(0, 0);
  document.querySelector("#field-title").focus();
}

function restoreEditorSelection() {
  const editor = document.querySelector("#field-body-editor");
  editor.focus();
  if (!savedEditorRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedEditorRange);
}

function applyBlockStyle(property, value) {
  restoreEditorSelection();
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const block = element?.closest("p,h1,h2,h3,h4,h5,li,div,blockquote");
  const editor = document.querySelector("#field-body-editor");
  if (block && block !== editor && editor.contains(block)) block.style[property] = value;
}

function saveDraft(formValues, action) {
  const code = formValues.document_code.trim();
  const originalCode = document.querySelector("#edit-original-code").value;
  if (!code || !isText(formValues.title) || !isText(formValues.owner_committee)) {
    throw new Error("Enter a document code, title, and owner.");
  }
  if (!isText(formValues.body_html)) {
    throw new Error("Enter the document body before saving.");
  }
  const safeBodyContainer = document.createElement("div");
  safeBodyContainer.append(renderSafeBody(formValues.body_html));
  if (!isValidDate(formValues.effective_date) || !isValidDate(formValues.review_date)) {
    throw new Error("Enter valid effective and review dates.");
  }
  if (Date.parse(`${formValues.review_date}T00:00:00Z`)
    < Date.parse(`${formValues.effective_date}T00:00:00Z`)) {
    throw new Error("The review date cannot be before the effective date.");
  }

  const existingDraft = editorSource?.status === "DRAFT";
  const currentApproved = documents.find(
    (item) => item.document_code === code && item.status === "APPROVED" && item.is_active,
  );
  if (!originalCode && documents.some((item) => item.document_code === code)) {
    throw new Error("That document code already exists. Choose the document to revise instead.");
  }
  if (originalCode && originalCode !== code) {
    throw new Error("Document codes cannot be changed.");
  }

  const history = existingDraft
    ? [...(editorSource.history ?? [])]
    : editorSource?.status === "APPROVED"
      ? [...(editorSource.history ?? []), versionHistorySnapshot(editorSource)]
      : [];
  const draft = {
    document_code: code,
    title: formValues.title.trim(),
    facility_level: formValues.facility_level.trim() || "Level 3B",
    county: formValues.county.trim(),
    sub_county: formValues.sub_county.trim(),
    owner_committee: formValues.owner_committee.trim(),
    version_number: document.querySelector("#field-version").value,
    effective_date: formValues.effective_date,
    review_date: formValues.review_date,
    approved_by: formValues.approved_by.trim(),
    approver_designation: formValues.approver_designation.trim(),
    approval_date: action === "approve" ? localDateString(new Date()) : null,
    status: action === "approve" ? "APPROVED" : "DRAFT",
    is_active: action === "approve",
    body_html: safeBodyContainer.innerHTML,
    history,
  };
  if (action === "approve" && !isText(draft.approved_by)) {
    throw new Error("Enter the authorized approver name before approving.");
  }
  if (action === "approve" && !isText(draft.approver_designation)) {
    throw new Error("Enter the authorized approver designation before approving.");
  }
  if (!isValidRecord(draft)) {
    throw new Error("Some document fields are invalid. Please review them and try again.");
  }

  if (existingDraft) {
    documents = documents.filter((item) => item !== editorSource);
  }
  if (action === "approve") {
    documents = documents.map((item) => {
      if (item.document_code === code && item.status === "APPROVED" && item.is_active) {
        return { ...item, status: "ARCHIVED", is_active: false };
      }
      return item;
    });
  } else if (currentApproved && !existingDraft && !editorSource) {
    throw new Error("An approved document must be revised from its document page.");
  }
  documents.push(draft);
  if (!persistDocuments()) throw new Error("The browser did not save the change.");

  populateCommitteeFilter();
  renderDocumentList();
  editorView.hidden = true;
  listView.hidden = false;
  editorSource = null;
  showCurrentRoute();
  if (!detailView.hidden) {
    window.location.hash = `document=${encodeURIComponent(code)}`;
    showCurrentRoute();
  } else {
    hideDataError();
  }
}

function openRevision(code) {
  const record = currentRecords().find((item) => item.document_code === code);
  if (!record) return;
  const draft = record.status === "APPROVED"
    ? {
      ...record,
      version_number: nextVersion(record.version_number),
      status: "DRAFT",
      is_active: false,
      approved_by: "",
      approver_designation: "",
      approval_date: null,
      history: [...(record.history ?? []), versionHistorySnapshot(record)],
    }
    : record;
  openEditor(draft);
  document.querySelector("#edit-original-code").value = code;
  if (record.status === "APPROVED") {
    document.querySelector("#field-version").value = draft.version_number;
  }
}

function exportApprovedDocuments() {
  const approved = documents.filter(isPublicRecord);
  const byCode = new Map();
  for (const record of approved) {
    byCode.set(record.document_code, {
      document_code: record.document_code,
      title: record.title,
      facility_level: record.facility_level || "Level 3B",
      county: record.county ?? "",
      sub_county: record.sub_county ?? "",
      owner_committee: record.owner_committee,
      version_number: record.version_number,
      effective_date: record.effective_date,
      review_date: record.review_date,
      approved_by: record.approved_by,
        approver_designation: record.approver_designation ?? "",
        approval_date: record.approval_date ?? "",
      status: "APPROVED",
      is_active: true,
      body_html: record.body_html,
      history: (record.history ?? []).filter((entry) => entry.status === "APPROVED"),
    });
  }

  const blob = new Blob([`${JSON.stringify([...byCode.values()], null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "documents.json";
  link.click();
  URL.revokeObjectURL(url);
  showDataError("Export downloaded. Replace the repository documents.json with this file and commit it to publish changes. This download does not update GitHub automatically.");
}

async function loadDocuments() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`The document data request returned HTTP ${response.status}.`);
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error("documents.json must contain a JSON array.");
    const baseRecords = records.filter(isPublicRecord);
    let localRecords = [];
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) localRecords = parsed.filter(isValidRecord);
      }
    } catch (error) {
      console.error("Unable to read local document changes:", error);
      showDataError("Saved browser drafts could not be read. The published catalogue is still available.");
    }
    const localCodes = new Set(localRecords.map((record) => record.document_code));
    documents = [
      ...baseRecords.filter((record) => !localCodes.has(record.document_code)),
      ...localRecords,
    ];
    populateCommitteeFilter();
    renderDocumentList();
    showCurrentRoute();
    if (baseRecords.length !== records.length && !dataMessage.hidden) {
      showDataError("Some published entries were omitted because they are not active approved documents or contain invalid data.");
    }
  } catch (error) {
    documents = [];
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
createButton.addEventListener("click", () => openEditor());
editButton.addEventListener("click", () => openRevision(currentDetailCode));
exportButton.addEventListener("click", exportApprovedDocuments);
cancelEditorButton.addEventListener("click", () => {
  editorView.hidden = true;
  if (currentDetailCode && window.location.hash) detailView.hidden = false;
  else listView.hidden = false;
});
documentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  hideEditorMessage();
  const submitter = event.submitter;
  const action = submitter?.value === "approve" ? "approve" : "draft";
  document.querySelector("#field-body").value =
    document.querySelector("#field-body-editor").innerHTML;
  const formValues = Object.fromEntries(new FormData(documentForm).entries());
  try {
    saveDraft(formValues, action);
  } catch (error) {
    showEditorMessage(error instanceof Error ? error.message : "Unable to save this document.");
  }
});
document.querySelectorAll(".format-button").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    restoreEditorSelection();
    document.execCommand(button.dataset.command, false);
  });
});
document.querySelector(".format-toolbar").addEventListener("mousedown", (event) => {
  const editor = document.querySelector("#field-body-editor");
  const selection = window.getSelection();
  if (event.target.closest("select,input") && selection.rangeCount
    && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
    savedEditorRange = selection.getRangeAt(0).cloneRange();
  }
});
document.addEventListener("selectionchange", () => {
  const editor = document.querySelector("#field-body-editor");
  const selection = window.getSelection();
  if (selection.rangeCount && editor.contains(selection.anchorNode)
    && editor.contains(selection.focusNode)) {
    savedEditorRange = selection.getRangeAt(0).cloneRange();
  }
});
document.querySelector("#format-block").addEventListener("change", (event) => {
  restoreEditorSelection();
  document.execCommand("formatBlock", false, `<${event.target.value}>`);
});
document.querySelector("#format-font").addEventListener("change", (event) => {
  if (!event.target.value) return;
  restoreEditorSelection();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand("fontName", false, event.target.value);
  event.target.value = "";
});
document.querySelector("#format-size").addEventListener("change", (event) => {
  if (!event.target.value) return;
  const editor = document.querySelector("#field-body-editor");
  restoreEditorSelection();
  document.execCommand("fontSize", false, "7");
  const pointSize = { "1": "8pt", "2": "10pt", "3": "12pt", "4": "14pt", "5": "18pt" }[event.target.value];
  editor.querySelectorAll('font[size="7"]').forEach((fontElement) => {
    const span = document.createElement("span");
    span.style.fontSize = pointSize;
    span.append(...fontElement.childNodes);
    fontElement.replaceWith(span);
  });
  event.target.value = "";
});
document.querySelector("#format-line-height").addEventListener("change", (event) => {
  if (event.target.value) applyBlockStyle("lineHeight", event.target.value);
  event.target.value = "";
});
document.querySelector("#format-indent").addEventListener("change", (event) => {
  if (event.target.value) applyBlockStyle("textIndent", event.target.value);
  event.target.value = "";
});
document.querySelector("#format-color").addEventListener("input", (event) => {
  restoreEditorSelection();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand("foreColor", false, event.target.value);
});
backLink.addEventListener("click", (event) => {
  event.preventDefault();
  window.location.hash = "";
});

loadDocuments();
