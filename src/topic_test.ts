import { assertEquals, assertInstanceOf } from "@std/assert";
import { createTopicSelector, TopicSelector } from "./topic.ts";

Deno.test("Topic Selectors", async (ctx) => {
  await ctx.step("Wildcard topic", () => {
    const selector = createTopicSelector("*");
    assertInstanceOf(selector, TopicSelector);
    assertEquals(selector.type, "wildcard");
    assertEquals(selector.toString(), "*");
    assertEquals(selector.test("any-topic"), true);
  });

  await ctx.step("Literal topic", () => {
    const topic = "https://example.com/foo";
    const selector = createTopicSelector(topic);
    assertInstanceOf(selector, TopicSelector);
    assertEquals(selector.type, "literal");
    assertEquals(selector.toString(), topic);
    assertEquals(selector.test(topic), true);
    assertEquals(selector.test("https://example.com/bar"), false);
  });

  await ctx.step("Template topic", () => {
    const topic = "https://example.com/foo/{id}";
    const selector = createTopicSelector(topic);
    assertInstanceOf(selector, TopicSelector);
    assertEquals(selector.type, "template");
    assertEquals(selector.test("https://example.com/foo/123"), true);
    assertEquals(selector.test("https://example.com/bar/123"), false);
    assertEquals(selector.toString(), "https://example.com/foo/:id");
  });

  await ctx.step("Template topic with base URL", () => {
    const topic = "/foo/{id}";
    const baseURL = new URL("https://example.com");
    const selector = createTopicSelector(topic, baseURL);
    assertInstanceOf(selector, TopicSelector);
    assertEquals(selector.type, "template");
    assertEquals(selector.toString(), "https://example.com/foo/:id");
    assertEquals(selector.test("https://example.com/foo/123"), true);
    assertEquals(selector.test("https://example.com/bar/123"), false);
  });
});
