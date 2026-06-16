import serverlessExpress from "@codegenie/serverless-express";
import { createShopifyApp } from "../shopify-app/create-app";

const app = createShopifyApp();

export const handler = serverlessExpress({ app });
