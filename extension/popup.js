import db from "./storage/db.js";
import { DB_VERSION } from "./storage/schema.js";

const message = document.getElementById("message");
const ping = document.getElementById("ping");

ping.addEventListener("click", async () => {
  await db.open();
  const tableNames = db.tables.map((table) => table.name).join(", ");
  message.textContent = `IndexedDB v${DB_VERSION} ready (tables: ${tableNames || "none"})`;
});
