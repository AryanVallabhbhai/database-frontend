#!/usr/bin/env python3
"""
Initialize demo database with schema and sample data.
Reads schema_setup.sql and schema_populate.sql from ./database/ and executes them.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import Error as MySQLError

# Load environment variables
load_dotenv()

# Database config
DB_HOST = os.getenv('DB_HOST')
DB_PORT = int(os.getenv('DB_PORT', '3306'))
DB_USER = os.getenv('DB_USER')
DB_PASS = os.getenv('DB_PASS')
DB_NAME_TEST = os.getenv('DB_NAME_TEST', 'demo')
DB_SSL_CA = os.getenv('DB_SSL_CA_PATH')

# SQL files directory
SQL_DIR = Path(__file__).parent.parent / 'database'
SETUP_FILE = SQL_DIR / 'schema_setup.sql'
POPULATE_FILE = SQL_DIR / 'schema_populate.sql'


def connect_to_db():
    """Create a connection to the Aiven MySQL server."""
    try:
        config = {
            'host': DB_HOST,
            'port': DB_PORT,
            'user': DB_USER,
            'password': DB_PASS,
            'autocommit': False,
        }
        
        if DB_SSL_CA and os.path.exists(DB_SSL_CA):
            config['ssl_ca'] = DB_SSL_CA
            config['ssl_verify_cert'] = True
        
        conn = mysql.connector.connect(**config)
        print(f'✓ Connected to {DB_HOST}:{DB_PORT}')
        return conn
    except MySQLError as e:
        print(f'✗ Connection failed: {e}')
        sys.exit(1)


def read_sql_file(filepath):
    """Read and parse SQL file, splitting by semicolons."""
    if not filepath.exists():
        print(f'✗ File not found: {filepath}')
        return []
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Split by semicolon and filter empty statements
    statements = [stmt.strip() for stmt in content.split(';') if stmt.strip()]
    return statements


def init_test_db(conn):
    """Initialize the test database with schema and data."""
    cursor = conn.cursor()
    
    try:
        # Step 1: Create or drop and recreate the test database
        print(f'\n→ Creating/resetting database "{DB_NAME_TEST}"...')
        cursor.execute(f'DROP DATABASE IF EXISTS {DB_NAME_TEST}')
        cursor.execute(f'CREATE DATABASE {DB_NAME_TEST}')
        cursor.execute(f'USE {DB_NAME_TEST}')
        print(f'✓ Database "{DB_NAME_TEST}" ready')
        
        # Step 2: Run schema setup
        print(f'\n→ Running schema setup...')
        setup_statements = read_sql_file(SETUP_FILE)
        for stmt in setup_statements:
            if stmt:
                cursor.execute(stmt)
        conn.commit()
        print(f'✓ Schema tables created')
        
        # Step 3: Run populate script
        print(f'\n→ Running data population...')
        populate_statements = read_sql_file(POPULATE_FILE)
        for stmt in populate_statements:
            if stmt:
                cursor.execute(stmt)
        conn.commit()
        print(f'✓ Sample data inserted')
        
        cursor.close()
        print(f'\n✓ Successfully initialized {DB_NAME_TEST} database!')
        
    except MySQLError as e:
        conn.rollback()
        cursor.close()
        print(f'\n✗ Error during initialization: {e}')
        sys.exit(1)


if __name__ == '__main__':
    print(f'Initializing test database "{DB_NAME_TEST}" on {DB_HOST}:{DB_PORT}')
    print(f'SQL files: {SQL_DIR}')
    print('-' * 60)
    
    # Verify SQL files exist
    if not SETUP_FILE.exists() or not POPULATE_FILE.exists():
        print(f'✗ Missing SQL files in {SQL_DIR}')
        sys.exit(1)
    
    # Connect and initialize
    conn = connect_to_db()
    init_test_db(conn)
    conn.close()
