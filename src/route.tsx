import type { ComponentType } from "react";
import { Toaster } from "sonner";
import {
  createBrowserRouter,
  Outlet,
  ScrollRestoration,
} from "react-router-dom";

import * as LandingPageModule from "@/pages/landing";
import * as NotFoundPageModule from "@/pages/notfound";
import * as StatisticPageModule from "@/pages/main/statistic";
import * as SurveyPageModule from "@/pages/main/survey";

type RouteModule = Record<string, unknown>;

function resolveRouteComponent(
  module: RouteModule,
  exportName: string,
): ComponentType {
  const component = module.default ?? module[exportName];

  if (!component) {
    throw new Error(
      `Missing route component export: expected default or named export \"${exportName}\".`,
    );
  }

  return component as ComponentType;
}

const Landing = resolveRouteComponent(
  LandingPageModule as RouteModule,
  "Landing",
);
const NotFound = resolveRouteComponent(
  NotFoundPageModule as RouteModule,
  "NotFound",
);
const Statistic = resolveRouteComponent(
  StatisticPageModule as RouteModule,
  "Statistic",
);
const Survey = resolveRouteComponent(
  SurveyPageModule as RouteModule,
  "Survey",
);

function RootRoute() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
      <Toaster richColors closeButton position="top-right" />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootRoute />,
    children: [
      {
        path: "/",
        element: <Landing />,
      },
      {
        path: "/survey",
        element: <Survey />,
      },
      {
        path: "/statistic",
        element: <Statistic />,
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
]);

export default router;
