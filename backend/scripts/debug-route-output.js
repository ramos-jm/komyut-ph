import { searchCommuteRoutes } from "../src/services/routingService.js";
import { pool } from "../src/db/pool.js";

async function runCase(originText, destinationText, originCoords, destinationCoords) {
  const result = await searchCommuteRoutes({ originText, destinationText, originCoords, destinationCoords });

  console.log(`\nCase: ${originText} -> ${destinationText}`);
  console.log(`Routes found: ${result.routes?.length || 0}`);

  for (const route of result.routes || []) {
    console.log(`- ${route.type}: steps=${route.steps?.length || 0}, mapSegments=${route.mapSegments?.length || 0}, pathCoordinates=${route.pathCoordinates?.length || 0}, fare=${route.estimatedFare}, eta=${route.estimatedMinutes}`);
  }

  console.log("Meta:", result.meta || {});
}

async function run() {
  await runCase(
    "Recto Manila",
    "Cubao QC",
    { latitude: 14.6031, longitude: 120.9851 },
    { latitude: 14.619, longitude: 121.0537 }
  );

  await runCase(
    "Mall of Asia",
    "Fairview",
    { latitude: 14.535, longitude: 120.982 },
    { latitude: 14.703, longitude: 121.066 }
  );
}

run()
  .catch((error) => {
    console.error("Debug route output failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
