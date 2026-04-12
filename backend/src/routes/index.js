import { Router } from "express";
import {
  getNearbyStops,
  getRouteDetails,
  getSavedRoutes,
  getTrainInfo,
  saveRoute,
  searchRoute
} from "../controllers/routeController.js";

export const apiRouter = Router();

apiRouter.get("/search-route", searchRoute);
apiRouter.get("/stops/nearby", getNearbyStops);
apiRouter.get("/routes/:id", getRouteDetails);
apiRouter.post("/save-route", saveRoute);
apiRouter.get("/saved-routes", getSavedRoutes);
apiRouter.get("/train-info", getTrainInfo);
