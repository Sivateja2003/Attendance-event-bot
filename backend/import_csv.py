"""
One-time script to bulk-import member_profiles.csv into Pinecone.
Run from backend/ directory:
    python import_csv.py [path/to/member_profiles.csv]
"""
import csv
import os
import sys

from dotenv import load_dotenv
load_dotenv()

from search_engine import SearchEngine


def _slug(image_filename: str) -> str:
    """images/Amarnadh_Reddy_Simhadri.jpeg  →  Amarnadh_Reddy_Simhadri"""
    return os.path.splitext(os.path.basename(image_filename))[0]


def _row_to_user(row: dict) -> dict:
    return {
        "id":                   _slug(row["image_filename"]),
        "name":                 row.get("full_name", ""),
        "email":                row.get("email", ""),
        "phone":                row.get("phone", ""),
        "company":              row.get("company", ""),
        "occupation":           row.get("industry", ""),   # CSV has no separate occupation
        "industry":             row.get("industry", ""),
        "website":              row.get("website", ""),
        "business_description": row.get("business_description", ""),
        "linkedin":             "",
    }


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else "member_profiles.csv"
    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        sys.exit(1)

    with open(csv_path, newline="", encoding="utf-8") as f:
        users = [_row_to_user(row) for row in csv.DictReader(f)]

    print(f"Importing {len(users)} profiles into Pinecone...")
    engine = SearchEngine()
    engine.upsert_bulk(users)
    print(f"Done. {len(users)} profiles indexed.")
