## R K Pathology

Run the application through its local server so authentication stays outside the frontend:

1. Copy `demo/.env.example` to `demo/.env` and set the username plus a strong scrypt password hash.
2. From `demo`, run `npm start`.
3. Open `http://127.0.0.1:3000`.

`demo/.env` is intentionally ignored by Git. Do not place passwords, password hashes, or production credentials in frontend files or public environment variables.
