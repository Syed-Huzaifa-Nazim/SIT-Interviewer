import io
import os
from pypdf import PdfReader

class PDFParser:
    @staticmethod
    def extract_text(pdf_path):
        """
        Extracts all text pages from a PDF document.
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found at: {pdf_path}")

        with open(pdf_path, 'rb') as handle:
            return PDFParser.extract_text_from_bytes(handle.read())

    @staticmethod
    def extract_text_from_bytes(data):
        """Same extraction straight from the uploaded bytes, with no temp file.

        The enrolment resume upload is unauthenticated, so not writing anonymous uploads to
        the server's disk at all — even briefly — is worth the small detour. pypdf reads a
        file-like object just as happily as a path.
        """
        try:
            reader = PdfReader(io.BytesIO(data))
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text.strip()
        except Exception as e:
            raise Exception(f"Failed to parse PDF document: {str(e)}")
