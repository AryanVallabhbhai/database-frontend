#!/usr/bin/env python3
"""
Flask backend to execute SQL against Aiven MySQL.
Accepts POST requests from the frontend with SQL statements and parameters.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error as MySQLError
from mysql.connector.pooling import MySQLConnectionPool
import json

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)

# Enable CORS for local frontend origins
def get_cors_origins():
    configured = os.getenv('CORS_ORIGIN', 'http://localhost:5173')
    origins = [origin.strip() for origin in configured.split(',') if origin.strip()]

    for local_origin in ('http://localhost:5173', 'http://127.0.0.1:5173'):
        if local_origin not in origins:
            origins.append(local_origin)

    return origins


CORS_ORIGINS = get_cors_origins()
CORS(app, origins=CORS_ORIGINS)

# Expected API token from frontend
API_TOKEN = os.getenv('API_TOKEN', 'replace-with-strong-token')

# Database credentials from environment
DB_HOST = os.getenv('DB_HOST')
DB_PORT = int(os.getenv('DB_PORT', '3306'))
DB_USER = os.getenv('DB_USER')
DB_PASS = os.getenv('DB_PASS')
DB_NAME = os.getenv('DB_NAME', 'restaurant_schema')
DB_NAME_TEST = os.getenv('DB_NAME_TEST', 'demo')
DB_SSL_CA = os.getenv('DB_SSL_CA_PATH')
DEFAULT_USE_TEST_DB = os.getenv('DEFAULT_USE_TEST_DB', 'true').lower() in (
    '1',
    'true',
    'yes',
    'on',
)


def _get_mysql_ssl_config():
    if DB_SSL_CA and os.path.exists(DB_SSL_CA):
        return {
            'ssl_ca': DB_SSL_CA,
            'ssl_verify_cert': True,
        }

    return {}


def run_schema_scripts(toggle: int, target_db: str):
    """Run schema setup + populate scripts when toggle is 1.

    Args:
        toggle: 0 to skip, 1 to run scripts.
        target_db: Database name where scripts should run.

    Returns:
        True when successful or skipped, False on failure.
    """
    if toggle == 0:
        print('Schema init toggle is 0. Skipping schema scripts.')
        return True

    if toggle != 1:
        print('Schema init toggle must be 0 or 1. Received:', toggle)
        return False

    setup_path = Path(__file__).resolve().parent.parent / 'database' / 'schema_setup.sql'
    populate_path = Path(__file__).resolve().parent.parent / 'database' / 'schema_populate.sql'

    if not setup_path.exists() or not populate_path.exists():
        print('Schema files not found. Expected:')
        print(f' - {setup_path}')
        print(f' - {populate_path}')
        return False

    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS,
            autocommit=False,
            **_get_mysql_ssl_config(),
        )
        cursor = conn.cursor()

        print(f'Resetting database: {target_db}')
        cursor.execute(f'DROP DATABASE IF EXISTS `{target_db}`')
        cursor.execute(f'CREATE DATABASE `{target_db}`')
        conn.commit()

        for script_path in (setup_path, populate_path):
            print(f'Running SQL script: {script_path.name} -> {target_db}')
            sql_script = script_path.read_text(encoding='utf-8')

            # Force scripts to target the requested database regardless of file defaults.
            sql_script = sql_script.replace('restaurant_schema', target_db)
            sql_script = sql_script.replace('demo-test', target_db)
            sql_script = sql_script.replace('demo', target_db)

            for _ in cursor.execute(sql_script, multi=True):
                pass

            conn.commit()

        cursor.close()
        conn.close()
        print(f'Schema setup and populate completed for database: {target_db}')
        return True
    except MySQLError as error:
        print(f'Failed running schema scripts: {error}')
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return False

# Helper function to create connection pool
def create_pool(pool_name, db_name):
    try:
        pool_size = int(os.getenv('DB_POOL_SIZE', '10'))
        db_config = {
            'host': DB_HOST,
            'port': DB_PORT,
            'user': DB_USER,
            'password': DB_PASS,
            'database': db_name,
            'autocommit': False,
        }
        
        # Add SSL config if CA path is provided
        db_config.update(_get_mysql_ssl_config())
        
        pool = MySQLConnectionPool(
            pool_name=pool_name,
            pool_size=pool_size,
            **db_config
        )
        print(f'✓ Connection pool created for {DB_HOST}:{DB_PORT}/{db_name}')
        return pool
    except Exception as e:
        print(f'✗ Failed to create connection pool for {db_name}: {e}')
        return None

# Create connection pools for production and test databases
connection_pool = create_pool('restaurant_pool', DB_NAME)
test_pool = create_pool('restaurant_test_pool', DB_NAME_TEST)


def verify_token():
    """Verify Bearer token from request headers."""
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return False
    token = auth[7:]
    return token == API_TOKEN


def to_mysql_placeholders(sql):
    """Convert frontend-friendly ? placeholders to mysql-connector placeholders."""
    return sql.replace('?', '%s')


def export_menu_items_to_json(pool, out_path: Path):
    """Export menu items from the given pool to a JSON file at out_path."""
    if not pool:
        print('Export skipped: connection pool not available')
        return False

    try:
        conn = pool.get_connection()
    except MySQLError as e:
        print(f'Export failed: could not get connection from pool: {e}')
        return False

    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT ItemID AS itemId, Name AS name, Type AS type, Price AS price FROM Items ORDER BY ItemID"
        )
        rows = cursor.fetchall()

        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open('w', encoding='utf-8') as f:
            json.dump(rows, f, default=str, ensure_ascii=False, indent=2)

        print(f'Exported {len(rows)} menu items to {out_path}')
        return True
    except MySQLError as e:
        print(f'Export failed: SQL error: {e}')
        return False
    finally:
        cursor.close()
        conn.close()


def export_servers_to_json(pool, out_path: Path):
    """Export servers from the given pool to a JSON file at out_path."""
    if not pool:
        print('Export skipped: connection pool not available')
        return False

    try:
        conn = pool.get_connection()
    except MySQLError as e:
        print(f'Export failed: could not get connection from pool: {e}')
        return False

    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT e.EmployeeID AS employeeId, e.Name AS name FROM Employee e INNER JOIN Server s ON e.EmployeeID = s.EmployeeID ORDER BY e.EmployeeID"
        )
        rows = cursor.fetchall()

        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open('w', encoding='utf-8') as f:
            json.dump(rows, f, default=str, ensure_ascii=False, indent=2)

        print(f'Exported {len(rows)} servers to {out_path}')
        return True
    except MySQLError as e:
        print(f'Export failed: SQL error: {e}')
        return False
    finally:
        cursor.close()
        conn.close()


@app.route('/menu_items.json', methods=['GET'])
def serve_menu_items_json():
    """Serve the exported menu_items.json file from the server static folder."""
    static_dir = Path(__file__).resolve().parent / 'static'
    filename = 'menu_items.json'
    if not (static_dir / filename).exists():
        return jsonify({'error': 'Menu items not available'}), 404
    return send_from_directory(str(static_dir), filename)


@app.route('/servers.json', methods=['GET'])
def serve_servers_json():
    """Serve the exported servers.json file from the server static folder."""
    static_dir = Path(__file__).resolve().parent / 'static'
    filename = 'servers.json'
    if not (static_dir / filename).exists():
        return jsonify({'error': 'Servers not available'}), 404
    return send_from_directory(str(static_dir), filename)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    prod_ready = connection_pool is not None
    test_ready = test_pool is not None

    if prod_ready or test_ready:
        return jsonify(
            {
                'status': 'ok',
                'default_db': DB_NAME_TEST if DEFAULT_USE_TEST_DB else DB_NAME,
                'prod_ready': prod_ready,
                'test_ready': test_ready,
            }
        ), 200

    return jsonify({'status': 'error', 'db': 'not ready'}), 503


@app.route('/db', methods=['POST'])
def execute_sql():
    """Execute SQL statements against the database.
    
    Query parameters:
    - test=true: Use the test database (demo) instead of production
    """
    if not verify_token():
        return jsonify({'error': 'Unauthorized'}), 401

    # Determine which pool to use: default from env, override with ?test=true/false
    test_param = request.args.get('test')
    if test_param is None:
        use_test = DEFAULT_USE_TEST_DB
    else:
        use_test = test_param.lower() in ('1', 'true', 'yes', 'on')

    pool = test_pool if use_test else connection_pool
    db_name = DB_NAME_TEST if use_test else DB_NAME

    if not pool:
        return jsonify({'error': f'Database "{db_name}" not ready'}), 503

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request body'}), 400

    conn = None
    cursor = None

    try:
        try:
            conn = pool.get_connection()
        except MySQLError as e:
            # Handle pool exhaustion or other pool-level errors
            return jsonify({'error': f'Database error: Failed getting connection; {str(e)}'}), 503

        cursor = conn.cursor(dictionary=True)

        # Single statement
        if 'sql' in data and 'params' in data:
            sql = data['sql']
            params = data['params']
            cursor.execute(to_mysql_placeholders(sql), params)

            # Check if it's a SELECT query
            if sql.strip().upper().startswith('SELECT'):
                result = cursor.fetchall()
                return jsonify(result), 200

            conn.commit()
            return jsonify({'rows_affected': cursor.rowcount}), 200

        # Batch transaction
        if 'statements' in data and data.get('transactional'):
            statements = data['statements']
            try:
                for stmt in statements:
                    sql = stmt['sql']
                    params = stmt.get('params', [])
                    cursor.execute(to_mysql_placeholders(sql), params)

                conn.commit()
                return jsonify({'rows_affected': cursor.rowcount}), 200
            except MySQLError as e:
                conn.rollback()
                return jsonify({'error': str(e)}), 400

        return jsonify({'error': 'Invalid request format'}), 400

    except MySQLError as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Internal error: {str(e)}'}), 500
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    schema_toggle = 0

    if len(sys.argv) > 1:
        try:
            schema_toggle = int(sys.argv[1])
        except ValueError:
            print('Usage: python app.py [0|1]')
            raise SystemExit(1)

    target_db = DB_NAME_TEST if DEFAULT_USE_TEST_DB else DB_NAME

    if not run_schema_scripts(schema_toggle, target_db):
        raise SystemExit(1)

    # Refresh pools after optional schema initialization.
    connection_pool = create_pool('restaurant_pool', DB_NAME)
    test_pool = create_pool('restaurant_test_pool', DB_NAME_TEST)

    # Export menu items and servers to JSON for quick frontend reads
    static_dir = Path(__file__).resolve().parent / 'static'
    default_pool = test_pool if DEFAULT_USE_TEST_DB else connection_pool
    
    menu_out_file = static_dir / 'menu_items.json'
    if export_menu_items_to_json(default_pool, menu_out_file):
        print('Menu items JSON ready.')
    else:
        print('Menu items JSON not available.')
    
    servers_out_file = static_dir / 'servers.json'
    if export_servers_to_json(default_pool, servers_out_file):
        print('Servers JSON ready.')
    else:
        print('Servers JSON not available.')

    port = int(os.getenv('SERVER_PORT', 3001))
    print(f'Starting server on http://localhost:{port}')
    app.run(debug=True, host='0.0.0.0', port=port)
