import { Router } from "express";
import {
  getAvailableCatalogList,
  getNearbyStops,
  getRouteDetails,
  getSavedRoutes,
  getTrainInfo,
  saveRoute,
  searchRoute,
  searchStops
} from "../controllers/routeController.js";
import {
  getSourceTruthSummary,
  listPendingCorrections,
  reviewCorrection,
  submitCorrection
} from "../controllers/sourceTruthController.js";

export const apiRouter = Router();

apiRouter.get("/search-route", searchRoute);
apiRouter.get("/stops/nearby", getNearbyStops);
apiRouter.get("/stops/search", searchStops);
apiRouter.get("/catalog/available", getAvailableCatalogList);
apiRouter.get("/source-truth/summary", getSourceTruthSummary);
apiRouter.post("/corrections", submitCorrection);
apiRouter.get("/corrections/pending", listPendingCorrections);
apiRouter.patch("/corrections/:id/review", reviewCorrection);
apiRouter.get("/routes/:id", getRouteDetails);
apiRouter.post("/save-route", saveRoute);
apiRouter.get("/saved-routes", getSavedRoutes);
apiRouter.get("/train-info", getTrainInfo);
