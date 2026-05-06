# Database Frontend with Flask Backend

This project uses a Flask backend to securely connect a React frontend to an Aiven MySQL database.

## Architecture

- **Frontend** (React + TypeScript): Runs on `http://localhost:5173`
- **Backend** (Flask): Runs on `http://localhost:3001`
- **Database** (Aiven MySQL): Connects securely via the backend

The frontend sends SQL requests to the Flask backend, which executes them against Aiven MySQL and returns results.

## Setup

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Install Flask Backend Dependencies

```bash
cd server
pip install -r requirements.txt
```

(Optional: use `python -m venv venv` and `source venv/bin/activate` or `venv\Scripts\activate` on Windows)

### 3. Configure Environment

Edit `.env` in the project root with your Aiven MySQL credentials:

```env
DB_HOST=your-aiven-host.aivencloud.com
DB_PORT=12345
DB_USER=avnadmin
DB_PASS=your_password
DB_NAME=restaurant_schema
API_TOKEN=strong-secret-token
VITE_DB_TOKEN=strong-secret-token
```

Ensure `API_TOKEN` and `VITE_DB_TOKEN` are the same and use a strong secret.

Optionally, if Aiven provides a CA cert, download it and set:
```env
DB_SSL_CA_PATH=/path/to/ca.pem
```

## Running

### Terminal 1: Start the Flask Backend

```bash
cd server
python app.py
```

You should see:
```
✓ Connection pool created for your-host:12345/restaurant_schema
Starting server on http://localhost:3001
```

### Terminal 2: Start the Frontend

```bash
npm run dev
```

You should see:
```
VITE v8.0.10 ready in XXX ms
➜  Local: http://localhost:5173/
```

Open `http://localhost:5173` in your browser and start using the app!

## Features

- **OrderPage**: Create orders with items and serving staff (transactional)
- **EmployeePage**: Add employees with role-specific details
- **MembershipPage**: Create customer rewards profiles

Each page sends SQL statements to the Flask backend, which executes them atomically against Aiven MySQL.

## Security Notes

- The frontend NEVER sees database credentials — all SQL execution happens server-side.
- The API token in `Authorization: Bearer <token>` protects the backend endpoint.
- CORS is restricted to the frontend origin (configurable in `.env`).
- Use HTTPS in production.
- Keep `.env` out of version control (already in `.gitignore`).

## Test Database Setup

To use a separate test database for development and testing:

### 1. Configure Test Database in `.env`

Add the test database name:
```env
DB_NAME_TEST=demo
```

### 2. Initialize the Test Database

Run the init script to clone the schema and sample data to the test database:

```bash
cd server
python init_test_db.py
```

This script:
- Creates the `demo` database (drops if exists)
- Runs `schema_setup.sql` to create tables
- Runs `schema_populate.sql` to insert sample data

Output should show:
```
✓ Connected to your-host:12345
✓ Database "demo" ready
✓ Schema tables created
✓ Sample data inserted
✓ Successfully initialized demo database!
```

### 3. Use the Test Database in Your App

**Option A: Send requests to test DB via query parameter**

When calling the backend, add `?test=true` to use the test database:
```javascript
// Frontend - in db.ts or restaurantRepository.ts
const testEndpoint = import.meta.env.VITE_DB_ENDPOINT + '?test=true'
```

**Option B: Always use test database**

Modify `.env` to swap the database names:
```env
DB_NAME=demo
DB_NAME_TEST=restaurant_schema
```

Then re-initialize as needed.

### 4. Reset Test Database

To reset the test database back to initial state:

```bash
cd server
python init_test_db.py
```

This will drop and recreate with fresh schema and data.

## Troubleshooting

**"Connection refused" error**
- Ensure Flask server is running on port 3001
- Check firewall/network settings

**"Unauthorized" error**
- Verify `VITE_DB_TOKEN` matches `API_TOKEN` in `.env`

**"Database connection error"**
- Verify Aiven credentials in `.env`
- Ensure your IP is whitelisted in Aiven's firewall settings
- If using CA cert, verify the path is correct

## Project Structure

```
database-frontend/database-project/
├── src/
│   ├── pages/
│   │   ├── OrderPage.tsx
│   │   ├── EmployeePage.tsx
│   │   ├── MembershipPage.tsx
│   ├── lib/
│   │   ├── db.ts (frontend HTTP layer)
│   │   ├── restaurantRepository.ts (business logic)
│   └── ...
├── server/
│   ├── app.py (Flask backend)
│   └── requirements.txt
├── .env (secrets, keep local)
├── .env.example (template)
└── ...
```

## Next Steps

- Configure monitoring/logging for production
- Add rate limiting to the backend
- Consider using connection pooling tuning for high load
- Add request validation/schema enforcement
