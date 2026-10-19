// Node backend entry point. Run: npm start
import { createApp } from "./src/app.js";
import { ROSTER } from "./src/store.js";

const PORT = Number(process.env.PORT) || 4000;

if (ROSTER.length === 0) {
  console.log("Could not read shared/roster.json. Run this from the backend-node folder of the project.");
}

createApp().listen(PORT, "127.0.0.1", () => {
  console.log(`Node backend on http://127.0.0.1:${PORT}  (${ROSTER.length} employees)`);
});
