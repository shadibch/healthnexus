// @ts-check
import node from "@prisma/composer/node";
import { compute } from "@prisma/composer-prisma-cloud";

export default compute({
  name: "clinic-app",
  deps: {},
  build: node({ module: import.meta.url, entry: "vite.config.ts", dependencies: "external" }),
});
