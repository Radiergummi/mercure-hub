import { setCookie } from "@std/http";
import z from "zod";
import type { Configuration } from "../config/mod.ts";
import { issueJwt } from "../jws.ts";
import { mercurePath } from "../routes.ts";
import type { Router } from "./router.ts";
import {
  asset,
  assets,
  checkContentType,
  extractFormData,
  parseFormBody,
  redirect,
} from "./utils.ts";

export function initializeWebUi(router: Router, config: Configuration) {
  router.get("/", () => redirect("/index.html"));
  router.get(
    "/index.html",
    asset("./public/index.html", {
      headers: ({ url }) =>
        new Headers({
          "link": `<${url.origin + mercurePath}>; rel="mercure"`,
        }),
    }),
  );
  router.get("/favicon.ico", asset("./public/favicon.ico"));
  router.get(
    "/assets/:path+",
    assets("./public", {
      showIndex: false,
    }),
  );

  router.post("/token", async ({ request }) => {
    checkContentType(request, "application/x-www-form-urlencoded");
    const rawBody = await parseFormBody(request);
    const rawData = extractFormData(rawBody);
    const data = z
      .object({
        publish: z
          .string()
          .array()
          .nonempty()
          .optional()
          .default(["*"]),
        subscribe: z
          .string()
          .array()
          .nonempty()
          .optional()
          .default(["*"]),
      })
      .parse(rawData);

    const [jwk, algorithm] = config.jwk!;
    const token = await issueJwt(jwk, algorithm, {
      publish: data.publish,
      subscribe: data.subscribe,
      audience: "mercure",
      subject: "mercure",
      issuer: "mercure",
    });

    const headers = new Headers();
    setCookie(headers, {
      name: config.cookieName,
      value: token,
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
      path: mercurePath,
    });

    return new Response("", { status: 204, headers });
  });
}
