"""
Découpage d'un PDF en passages exploitables pour le RAG.
Chaque passage = ~CHUNK_SIZE caractères avec chevauchement, en gardant le n° de page.
"""
import re
import uuid
import fitz  # PyMuPDF

CHUNK_SIZE = 700        # caractères par passage
CHUNK_OVERLAP = 120     # chevauchement entre passages consécutifs


# Mot "bruit" : longues suites de majuscules sans voyelle (codes-barres 2D-DOC, etc.)
_NOISE_TOKEN = re.compile(r"^[A-Z0-9]{16,}$")

# Normalisation de symboles mal extraits par PyMuPDF
_SYMBOL_FIXES = {"¤": "€", " ": " "}


def _strip_noise(text: str) -> str:
    """Retire les tokens illisibles (codes-barres) qui polluent le contexte du LLM."""
    out_lines = []
    for line in text.split("\n"):
        kept = [tok for tok in line.split(" ") if not _NOISE_TOKEN.match(tok)]
        out_lines.append(" ".join(kept))
    return "\n".join(out_lines)


def _clean(text: str) -> str:
    # Normalise les espaces/sauts de ligne multiples
    text = text.replace("\r", "\n")
    for bad, good in _SYMBOL_FIXES.items():
        text = text.replace(bad, good)
    text = _strip_noise(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_page(text: str, page_num: int) -> list[dict]:
    """Découpe le texte d'une page en passages avec chevauchement."""
    text = _clean(text)
    if not text:
        return []

    chunks = []
    start = 0
    n = len(text)
    while start < n:
        end = min(n, start + CHUNK_SIZE)
        # Essaie de couper proprement sur une fin de phrase/paragraphe
        if end < n:
            window = text[start:end]
            cut = max(window.rfind("\n\n"), window.rfind(". "), window.rfind("\n"))
            if cut > CHUNK_SIZE * 0.5:
                end = start + cut + 1
        passage = text[start:end].strip()
        if passage:
            chunks.append({"text": passage, "page": page_num})
        if end >= n:
            break
        start = max(start + 1, end - CHUNK_OVERLAP)
    return chunks


def index_pdf(pdf_path: str) -> dict:
    """Retourne {doc_id, chunks: [{text, page}], metadata}."""
    doc = fitz.open(pdf_path)
    chunks: list[dict] = []
    for i, page in enumerate(doc, start=1):
        text = page.get_text("text")
        if text:
            chunks.extend(_split_page(text, i))
    meta = doc.metadata or {}
    n_pages = doc.page_count
    doc.close()
    return {
        "doc_id": str(uuid.uuid4()),
        "chunks": chunks,
        "metadata": {"title": meta.get("title") or "", "pages": n_pages},
    }
