/**
 * OCR API — Client-side document text extraction using Tesseract.js
 * Extracts text from uploaded images/PDFs and identifies document-relevant keywords.
 */

/* global Tesseract */

// ─── Keyword dictionaries for document classification ────────────────────────
const KEYWORD_DICTIONARIES = {
  identity: [
    "passport", "identity", "national", "card", "name", "nationality",
    "birth", "expiry", "date", "gender", "sex", "issued", "valid",
    "government", "citizen", "republic", "ministry", "authority",
    "photograph", "signature", "number", "id", "aadhaar", "aadhar",
    "voter", "pan", "license", "driving", "election", "commission",
    "unique", "identification", "resident", "permanent", "address",
  ],
  land: [
    "title", "deed", "registry", "lease", "acre", "plot", "survey",
    "owner", "register", "land", "property", "boundary", "area",
    "hectare", "agriculture", "farm", "parcel", "certificate",
    "transfer", "registration", "revenue", "district", "village",
    "tehsil", "taluk", "patta", "khata", "khasra", "mutation",
    "encumbrance", "possession", "occupant", "tenure", "holding",
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Classify a document by matching extracted text against keyword dictionaries.
 * @param {string} text — Raw OCR text
 * @param {string} docPurpose — "identity" | "land" | "generic"
 * @returns {{ docType: string, confidence: number, keywordsFound: string[] }}
 */
function classifyDocument(text, docPurpose) {
  const lower = text.toLowerCase();
  const dict = KEYWORD_DICTIONARIES[docPurpose] || [
    ...KEYWORD_DICTIONARIES.identity,
    ...KEYWORD_DICTIONARIES.land,
  ];

  const found = dict.filter((kw) => lower.includes(kw));
  const confidence = Math.min(found.length / Math.max(dict.length * 0.25, 1), 1);

  let docType = "Unknown Document";
  if (docPurpose === "identity" && found.length > 0) {
    docType = detectIdentityType(found);
  } else if (docPurpose === "land" && found.length > 0) {
    docType = detectLandType(found);
  } else if (found.length > 0) {
    docType = "Detected Document";
  }

  return { docType, confidence, keywordsFound: [...new Set(found)] };
}

function detectIdentityType(keywords) {
  if (keywords.includes("passport")) return "Passport";
  if (keywords.includes("aadhaar") || keywords.includes("aadhar")) return "Aadhaar Card";
  if (keywords.includes("voter") || keywords.includes("election")) return "Voter ID";
  if (keywords.includes("pan")) return "PAN Card";
  if (keywords.includes("driving") || keywords.includes("license")) return "Driving License";
  return "Government ID";
}

function detectLandType(keywords) {
  if (keywords.includes("lease")) return "Lease Agreement";
  if (keywords.includes("deed") || keywords.includes("title")) return "Title Deed";
  if (keywords.includes("patta") || keywords.includes("khata")) return "Land Patta / Khata";
  if (keywords.includes("encumbrance")) return "Encumbrance Certificate";
  if (keywords.includes("mutation")) return "Mutation Record";
  return "Land Registry Document";
}

/**
 * Convert an image File to a data URL for Tesseract.
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract text from an uploaded file using Tesseract.js OCR.
 * @param {File} file — The image file to process
 * @param {string} docPurpose — "identity" | "land" | "generic"
 * @param {function} [onProgress] — Optional callback receiving { status, progress }
 * @returns {Promise<Object>} — Structured extraction result
 */
export async function extractDocumentText(file, docPurpose = "generic", onProgress = null) {
  if (!(file instanceof File)) {
    throw new Error("A valid file must be selected for OCR extraction.");
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      `Unsupported file type "${file.type}". Please upload a PNG, JPG, or WEBP image.`
    );
  }

  if (typeof Tesseract === "undefined") {
    throw new Error(
      "OCR engine not loaded. Please check your internet connection and reload the page."
    );
  }

  const imageData = await fileToDataUrl(file);

  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (info) => {
      if (onProgress && info.status && typeof info.progress === "number") {
        onProgress({
          status: info.status,
          progress: Math.round(info.progress * 100),
        });
      }
    },
  });

  try {
    const { data } = await worker.recognize(imageData);
    const ocrText = (data.text || "").trim();
    const ocrConfidence = (data.confidence || 0) / 100;
    const classification = classifyDocument(ocrText, docPurpose);

    return {
      ocr_text: ocrText,
      confidence: Math.round(((ocrConfidence + classification.confidence) / 2) * 100) / 100,
      doc_type: classification.docType,
      detected_type: classification.docType,
      keywords_found: classification.keywordsFound,
      extracted_data: {
        rawConfidence: ocrConfidence,
        classificationConfidence: classification.confidence,
        wordCount: ocrText.split(/\s+/).filter(Boolean).length,
        lineCount: ocrText.split("\n").filter((l) => l.trim()).length,
      },
    };
  } finally {
    await worker.terminate();
  }
}
