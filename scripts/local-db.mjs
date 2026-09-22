import { execSync } from "child_process";

console.log("=== Opmaint PTW Local Database Helper ===");

const dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
  console.log(`Detected DATABASE_URL: ${dbUrl.replace(/:[^:@]+@/, ":****@")}`);
  console.log("Attempting prisma db push / migrate deploy to verify connection...");
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    console.log("Database migrations are up to date!");
  } catch (err) {
    console.warn("Could not run migration on configured DATABASE_URL:", err.message);
  }
} else {
  console.log("No DATABASE_URL found in environment or .env file.");
  console.log("\nTo connect to a PostgreSQL database:");
  console.log("1. Set DATABASE_URL in .env (e.g., Neon serverless, local Postgres, or Docker container).");
  console.log("   Format: postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require");
  console.log("2. Run 'npm run db:deploy' to apply PostgreSQL migrations.");
  console.log("3. Run 'npm run db:seed' to seed the initial industrial hierarchy.");
}
