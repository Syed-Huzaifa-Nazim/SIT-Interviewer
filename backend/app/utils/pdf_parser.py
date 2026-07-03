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

        try:
            reader = PdfReader(pdf_path)
            text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return text.strip()
        except Exception as e:
            raise Exception(f"Failed to parse PDF document: {str(e)}")
