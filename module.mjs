// @ts-check
import { module } from "@prisma/composer";
import apiServerService from "./artifacts/api-server/service.mjs";
import clinicAppService from "./artifacts/clinic-app/service.mjs";

export default module("api-server", ({ provision }) => {
  provision(apiServerService, { id: "apiserver" });
  provision(clinicAppService, { id: "clinicapp" });
});
