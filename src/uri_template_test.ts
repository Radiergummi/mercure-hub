import { assert, assertEquals, assertFalse } from "@std/assert";
import { convertToUrlPattern, extractUriTemplate } from "./uri_template.ts"; // region convertToUrlPattern
import type { Wildcard } from "./topic.ts";

type URI = `https://example.com/${string}`;
type URITemplate = URI | "*";
type URLPattern = URI | typeof Wildcard;
type ConversionTestCase = [URITemplate, URLPattern, string?];

// region convertToUrlPattern
Deno.test("Convert URI Templates to URL Patterns", async (test) => {
  const levelGroups = {
    "Level 1 templates: Simple string expansion": [
      [
        "https://example.com/{foo}",
        "https://example.com/:foo",
      ],
      [
        "https://example.com/{foo}/{bar}",
        "https://example.com/:foo/:bar",
      ],
      [
        "https://example.com/{foo}/bar/{baz}",
        "https://example.com/:foo/bar/:baz",
      ],
      [
        "https://example.com/?foo={bar}",
        "https://example.com/?foo=:bar",
      ],
    ],

    "Level 2 templates: Reserved string expansion": [
      [
        "https://example.com/{+foo}",
        "https://example.com/:foo(.+)",
      ],
      [
        "https://example.com/{+foo}/bar",
        "https://example.com/:foo(.+)/bar",
      ],
      [
        "https://example.com/?foo={+bar}",
        "https://example.com/?foo=:bar(.+)",
      ],
    ],
    "Level 2 templates: Fragment expansion": [
      [
        "https://example.com/{#foo}",
        "https://example.com/#:foo(.+)",
      ],
      [
        "https://example.com/{#foo}{#bar}",
        "https://example.com/#:foo(.+)",
        "Ignoring multiple fragments",
      ],
    ],
    "Level 2 templates: Label expansion": [
      [
        "https://example.com/file{.ext}",
        "https://example.com/file.:ext",
      ],
      [
        "https://example.com/{.foo}",
        "https://example.com/{.:foo}",
        "Wrapping in braces if label follows a slash",
      ],
      [
        "https://example.com/file{.ext}/foo",
        "https://example.com/file.:ext/foo",
      ],
      [
        "https://example.com/file{.ext}/foo/{bar}",
        "https://example.com/file.:ext/foo/:bar",
      ],
    ],

    "Level 3 templates: Simple expansion with multiple variables": [
      [
        "https://example.com/{foo,bar}",
        "https://example.com/:foo,:bar",
      ],
      [
        "https://example.com/{foo,bar,baz}",
        "https://example.com/:foo,:bar,:baz",
      ],
      [
        "https://example.com/{foo,bar,baz}/qux",
        "https://example.com/:foo,:bar,:baz/qux",
      ],
      [
        "https://example.com/{foo,bar,baz}/qux/{quux}",
        "https://example.com/:foo,:bar,:baz/qux/:quux",
      ],
    ],
    "Level 3 templates: Reserved expansion with multiple variables": [
      [
        "https://example.com/{+foo,bar}",
        "https://example.com/:foo(.+),:bar(.+)",
      ],
      [
        "https://example.com/{+foo,bar,baz}",
        "https://example.com/:foo(.+),:bar(.+),:baz(.+)",
      ],
      [
        "https://example.com/{+foo,bar,baz}/qux",
        "https://example.com/:foo(.+),:bar(.+),:baz(.+)/qux",
      ],
      [
        "https://example.com/{+foo,bar,baz}/qux/{quux}",
        "https://example.com/:foo(.+),:bar(.+),:baz(.+)/qux/:quux",
      ],
    ],
    "Level 3 templates: Fragment expansion with multiple variables": [
      [
        "https://example.com/{#foo,bar}",
        "https://example.com/#:foo(.+),:bar(.+)",
      ],
      [
        "https://example.com/{#foo,bar,baz}",
        "https://example.com/#:foo(.+),:bar(.+),:baz(.+)",
      ],
    ],
    "Level 3 templates: Label expansion": [
      [
        "https://example.com/file{.ext1,ext2}",
        "https://example.com/file.:ext1.:ext2",
      ],
      [
        "https://example.com/file{.ext1,ext2}/foo",
        "https://example.com/file.:ext1.:ext2/foo",
      ],
      [
        "https://example.com/file{.ext1,ext2}/foo/{bar}",
        "https://example.com/file.:ext1.:ext2/foo/:bar",
      ],
      [
        "https://example.com/{.foo,bar}",
        "https://example.com/{.:foo}.:bar",
        "Wrapping first variable in braces if label follows a slash",
      ],
    ],
    "Level 3 templates: Path segments": [
      [
        "https://example.com/{/foo}",
        "https://example.com/:foo",
      ],
      [
        "https://example.com/{/foo}/bar",
        "https://example.com/:foo/bar",
      ],
      [
        "https://example.com/{/foo}/bar/{baz}",
        "https://example.com/:foo/bar/:baz",
      ],
      [
        "https://example.com/{/foo}/bar/{baz}/qux",
        "https://example.com/:foo/bar/:baz/qux",
      ],
    ],
    "Level 3 templates: Path-style parameters": [
      [
        "https://example.com/{;foo}",
        "https://example.com/;foo:foo",
      ],
      [
        "https://example.com/{;foo}/bar",
        "https://example.com/;foo:foo/bar",
      ],
      [
        "https://example.com/{;foo}/bar/{baz}",
        "https://example.com/;foo:foo/bar/:baz",
      ],
      [
        "https://example.com/{;foo}/bar/{baz}/qux",
        "https://example.com/;foo:foo/bar/:baz/qux",
      ],
      [
        "https://example.com/{;foo,bar}",
        "https://example.com/;foo:foo;bar:bar",
      ],
      [
        "https://example.com/{;foo,bar}/baz",
        "https://example.com/;foo:foo;bar:bar/baz",
      ],
    ],
    "Level 3 templates: Form-style query": [
      [
        "https://example.com/{?foo}",
        "https://example.com/?foo:foo",
      ],
      [
        "https://example.com/{?foo}/bar",
        "https://example.com/?foo:foo/bar",
      ],
      [
        "https://example.com/{?foo}/bar/{baz}",
        "https://example.com/?foo:foo/bar/:baz",
      ],
      [
        "https://example.com/{?foo}/bar/{baz}/qux",
        "https://example.com/?foo:foo/bar/:baz/qux",
      ],
      [
        "https://example.com/{?foo,bar}",
        "https://example.com/?foo:foo&bar:bar",
      ],
      [
        "https://example.com/{?foo,bar}/baz",
        "https://example.com/?foo:foo&bar:bar/baz",
      ],
    ],
    "Level 3 templates: Form-style query continuation": [
      [
        "https://example.com/{&foo}",
        "https://example.com/&foo:foo",
      ],
      [
        "https://example.com/{&foo}/bar",
        "https://example.com/&foo:foo/bar",
      ],
      [
        "https://example.com/{&foo}/bar/{baz}",
        "https://example.com/&foo:foo/bar/:baz",
      ],
      [
        "https://example.com/{&foo}/bar/{baz}/qux",
        "https://example.com/&foo:foo/bar/:baz/qux",
      ],
      [
        "https://example.com/{&foo,bar}",
        "https://example.com/&foo:foo&bar:bar",
      ],
      [
        "https://example.com/{&foo,bar}/baz",
        "https://example.com/&foo:foo&bar:bar/baz",
      ],
    ],

    "Level 4 templates: String expansion with substring value modifier": [
      [
        "https://example.com/{foo:3}",
        "https://example.com/:foo(.[^/]{3})",
      ],
      [
        "https://example.com/{foo:30}",
        "https://example.com/:foo(.[^/]{30})",
      ],
    ],
    "Level 4 templates: String expansion with list expansion value modifier": [
      [
        "https://example.com/{foo*}",
        "https://example.com/:foo*",
      ],
      [
        "https://example.com/{foo*}/{bar}",
        "https://example.com/:foo*/:bar",
      ],
    ],
    "Level 4 templates: Reserved expansion with value modifiers": [
      [
        "https://example.com/{+foo:3}",
        "https://example.com/:foo(.{3})",
      ],
      [
        "https://example.com/{+foo:3}/bar",
        "https://example.com/:foo(.{3})/bar",
      ],
      [
        "https://example.com/{+foo*}",
        "https://example.com/:foo(.+)*",
      ],
      [
        "https://example.com/{+foo*}/{bar}",
        "https://example.com/:foo(.+)*/:bar",
      ],
      [
        "https://example.com/{+foo*}/{bar*}",
        "https://example.com/:foo(.+)*/:bar*",
      ],
    ],
    "Level 4 templates: Fragment expansion with value modifiers": [
      [
        "https://example.com/{#foo:3}",
        "https://example.com/#:foo(.{3})",
      ],
      [
        "https://example.com/{#foo:3}/bar",
        "https://example.com/#:foo(.{3})/bar",
      ],
      [
        "https://example.com/{#foo*}",
        "https://example.com/#:foo(.+)*",
      ],
      [
        "https://example.com/{#foo*}{#bar}",
        "https://example.com/#:foo(.+)*",
        "Ignoring multiple fragments",
      ],
    ],
    "Level 4 templates: Label expansion with value modifiers": [
      [
        "https://example.com/file{.ext:3}",
        "https://example.com/file.:ext(.[^/]{3})",
      ],
      [
        "https://example.com/file{.ext*}",
        "https://example.com/file.:ext*",
      ],
    ],
    "Level 4 templates: Path segments with value modifiers": [
      [
        "https://example.com/{/foo:1}",
        "https://example.com/:foo(.[^/]{1})",
      ],
      [
        "https://example.com/{/foo:1,bar}",
        "https://example.com/:foo(.[^/]{1})/:bar",
      ],
      [
        "https://example.com/{/foo*}",
        "https://example.com/:foo*",
      ],
      [
        "https://example.com/{/foo*,bar:3}",
        "https://example.com/:foo*/:bar(.[^/]{3})",
      ],
    ],
    "Level 4 templates: Path-style parameters with value modifiers": [
      [
        "https://example.com/{;foo:5}",
        "https://example.com/;foo:foo(.[^/]{5})",
      ],
      [
        "https://example.com/{;foo*}",
        "https://example.com/;foo:foo*",
      ],
    ],
    "Level 4 templates: Form-style query with value modifiers": [
      [
        "https://example.com/{?foo:3}",
        "https://example.com/?foo:foo(.[^/]{3})",
      ],
      [
        "https://example.com/{?foo*}",
        "https://example.com/?foo:foo*",
      ],
      [
        "https://example.com/{?foo*,bar}",
        "https://example.com/?foo:foo*&bar:bar",
      ],
    ],
    "Level 4 templates: form-style query continuation with value modifiers": [
      [
        "https://example.com/{&foo:3}",
        "https://example.com/&foo:foo(.[^/]{3})",
      ],
      [
        "https://example.com/{&foo*}",
        "https://example.com/&foo:foo*",
      ],
      [
        "https://example.com/{&foo*,bar}",
        "https://example.com/&foo:foo*&bar:bar",
      ],
    ],
    // "Special cases": [
    //     ["*", Wildcard, "Asterisk Operator"],
    // ],
  } satisfies Record<string, ConversionTestCase[]>;

  for (const [name, cases] of Object.entries(levelGroups)) {
    await test.step(name, async (test) => {
      for (const [template, expected, name] of cases) {
        await test.step(
          (typeof name !== "undefined" ? `${name}: ` : "") +
            `${template} is converted to ${String(expected)}`,
          () => {
            const pattern = convertToUrlPattern(template);
            const actual = pattern.protocol + "://" +
              pattern.hostname +
              pattern.pathname +
              (pattern.search ? `?${pattern.search}` : "") +
              (pattern.hash ? `#${pattern.hash}` : "");

            assertEquals(
              actual,
              String(expected),
              `URI Template conversion failed: Expected ${actual} to equal ${String(expected)}`,
            );
          },
        );
      }
    });
  }
});

// endregion

if (Deno.args[0] === "extract") {
  // region extractUriTemplate
  Deno.test("Template ['{count}'] matches URI ['one,two,three']", () =>
    assert(extractUriTemplate("'{count}'", "'one,two,three'")));
  Deno.test("Template [{count}] matches URI [one,two,three]", () =>
    assert(extractUriTemplate("{count}", "one,two,three")));
  Deno.test("Template [{count*}] matches URI [one,two,three]", () =>
    assert(extractUriTemplate("{count*}", "one,two,three")));
  Deno.test("Template [{/count}] matches URI [/one,two,three]", () =>
    assert(extractUriTemplate("{/count}", "/one,two,three")));
  Deno.test("Template [{/count*}] matches URI [/one/two/three]", () =>
    assert(extractUriTemplate("{/count*}", "/one/two/three")));
  Deno.test("Template [{;count}] matches URI [;count=one,two,three]", () =>
    assert(extractUriTemplate("{;count}", ";count=one,two,three")));
  Deno.test("Template [{;count*}] matches URI [;count=one;count=two;count=three]", () =>
    assert(
      extractUriTemplate("{;count*}", ";count=one;count=two;count=three"),
    ));
  Deno.test("Template [{?count}] matches URI [?count=one,two,three]", () =>
    assert(extractUriTemplate("{?count}", "?count=one,two,three")));
  Deno.test("Template [{?count*}] matches URI [?count=one&count=two&count=three]", () =>
    assert(
      extractUriTemplate("{?count*}", "?count=one&count=two&count=three"),
    ));
  Deno.test("Template [{&count*}] matches URI [&count=one&count=two&count=three]", () =>
    assert(
      extractUriTemplate("{&count*}", "&count=one&count=two&count=three"),
    ));
  Deno.test("Template [{var}] matches URI [value]", () =>
    assert(extractUriTemplate("{var}", "value")));
  Deno.test("Template [{hello}] matches URI [Hello%20World%21]", () =>
    assert(extractUriTemplate("{hello}", "Hello%20World%21")));
  Deno.test("Template [{half}] matches URI [50%25]", () =>
    assert(extractUriTemplate("{half}", "50%25")));
  Deno.test("Template [O{empty}X] matches URI [OX]", () =>
    assert(extractUriTemplate("O{empty}X", "OX")));
  Deno.test("Template [O{undef}X] matches URI [OX]", () =>
    assert(extractUriTemplate("O{undef}X", "OX")));
  Deno.test("Template [{x,y}] matches URI [1024,768]", () =>
    Deno.test("Template [{x,y}] matches URI [1024,768]", () =>
      assert(extractUriTemplate("{x,y}", "1024,768"))));
  Deno.test("Template [{x,hello,y}] does not match URI [1024,Hello%20World%21,768]", () =>
    assertFalse(
      extractUriTemplate("{x,hello,y}", "1024,Hello%20World%21,768"),
    ));
  Deno.test("Template [?{x,empty}] matches URI [?1024,]", () =>
    assert(extractUriTemplate("?{x,empty}", "?1024,")));
  Deno.test("Template [?{x,undef}] matches URI [?1024]", () =>
    assert(extractUriTemplate("?{x,undef}", "?1024")));
  Deno.test("Template [?{undef,y}] does not match URI [?768]", () =>
    assertFalse(extractUriTemplate("?{undef,y}", "?768")));
  Deno.test("Template [{var:3}] matches URI [val]", () =>
    assert(extractUriTemplate("{var:3}", "val")));
  Deno.test("Template [{var:30}] matches URI [value]", () =>
    assert(extractUriTemplate("{var:30}", "value")));
  Deno.test("Template [{list}] matches URI [red,green,blue]", () =>
    assert(extractUriTemplate("{list}", "red,green,blue")));
  Deno.test("Template [{list*}] matches URI [red,green,blue]", () =>
    assert(extractUriTemplate("{list*}", "red,green,blue")));
  Deno.test("Template [{keys}] does not match URI [semi,%3B,dot,.,comma,%2C]", () =>
    assertFalse(extractUriTemplate("{keys}", "semi,%3B,dot,.,comma,%2C")));
  Deno.test("Template [{keys*}] does not match URI [semi=%3B,dot=.,comma=%2C]", () =>
    assertFalse(extractUriTemplate("{keys*}", "semi=%3B,dot=.,comma=%2C")));
  Deno.test("Template [{+var}] matches URI [value]", () =>
    assert(extractUriTemplate("{+var}", "value")));
  Deno.test("Template [{+hello}] matches URI [Hello%20World!]", () =>
    assert(extractUriTemplate("{+hello}", "Hello%20World!")));
  Deno.test("Template [{+half}] matches URI [50%25]", () =>
    assert(extractUriTemplate("{+half}", "50%25")));
  Deno.test("Template [{base}index] matches URI [http%3A%2F%2Fexample.com%2Fhome%2Findex]", () =>
    assert(
      extractUriTemplate(
        "{base}index",
        "http%3A%2F%2Fexample.com%2Fhome%2Findex",
      ),
    ));
  Deno.test("Template [{+base}index] matches URI [http://example.com/home/index]", () =>
    assert(
      extractUriTemplate("{+base}index", "http://example.com/home/index"),
    ));
  Deno.test("Template [O{+empty}X] matches URI [OX]", () =>
    assert(extractUriTemplate("O{+empty}X", "OX")));
  Deno.test("Template [O{+undef}X] matches URI [OX]", () =>
    assert(extractUriTemplate("O{+undef}X", "OX")));
  Deno.test("Template [{+path}/here] matches URI [/foo/bar/here]", () =>
    assert(extractUriTemplate("{+path}/here", "/foo/bar/here")));
  Deno.test("Template [here?ref={+path}] matches URI [here?ref=/foo/bar]", () =>
    assert(extractUriTemplate("here?ref={+path}", "here?ref=/foo/bar")));
  Deno.test("Template [up{+path}{var}/here] does not match URI [up/foo/barvalue/here]", () =>
    assertFalse(
      extractUriTemplate("up{+path}{var}/here", "up/foo/barvalue/here"),
    ));
  Deno.test("Template [{+x,hello,y}] does not match URI [1024,Hello%20World!,768]", () =>
    assertFalse(
      extractUriTemplate("{+x,hello,y}", "1024,Hello%20World!,768"),
    ));
  Deno.test("Template [{+path,x}/here] does not match URI [/foo/bar,1024/here]", () =>
    assertFalse(
      extractUriTemplate("{+path,x}/here", "/foo/bar,1024/here"),
    ));
  Deno.test("Template [{+path:6}/here] matches URI [/foo/b/here]", () =>
    assert(extractUriTemplate("{+path:6}/here", "/foo/b/here")));
  Deno.test("Template [{+list}] does not match URI [red,green,blue]", () =>
    assertFalse(extractUriTemplate("{+list}", "red,green,blue")));
  Deno.test("Template [{+list*}] does not match URI [red,green,blue]", () =>
    assertFalse(extractUriTemplate("{+list*}", "red,green,blue")));
  Deno.test("Template [{+keys}] does not match URI [semi,;,dot,.,comma,,]", () =>
    assertFalse(extractUriTemplate("{+keys}", "semi,;,dot,.,comma,,")));
  Deno.test("Template [{+keys*}] does not match URI [semi=;,dot=.,comma=,]", () =>
    assertFalse(extractUriTemplate("{+keys*}", "semi=;,dot=.,comma=,")));
  Deno.test("Template [{#var}] matches URI [#value]", () =>
    assert(extractUriTemplate("{#var}", "#value")));
  Deno.test("Template [{#hello}] matches URI [#Hello%20World!]", () =>
    assert(extractUriTemplate("{#hello}", "#Hello%20World!")));
  Deno.test("Template [{#half}] matches URI [#50%25]", () =>
    assert(extractUriTemplate("{#half}", "#50%25")));
  Deno.test("Template [foo{#empty}] matches URI [foo#]", () =>
    assert(extractUriTemplate("foo{#empty}", "foo#")));
  Deno.test("Template [foo{#undef}] matches URI [foo]", () =>
    assert(extractUriTemplate("foo{#undef}", "foo")));
  Deno.test("Template [{#x,hello,y}] does not match URI [#1024,Hello%20World!,768]", () =>
    assertFalse(
      extractUriTemplate("{#x,hello,y}", "#1024,Hello%20World!,768"),
    ));
  Deno.test("Template [{#path,x}/here] does not match URI [#/foo/bar,1024/here]", () =>
    assertFalse(
      extractUriTemplate("{#path,x}/here", "#/foo/bar,1024/here"),
    ));
  Deno.test("Template [{#path:6}/here] matches URI [#/foo/b/here]", () =>
    assert(extractUriTemplate("{#path:6}/here", "#/foo/b/here")));
  Deno.test("Template [{#list}] does not match URI [#red,green,blue]", () =>
    assertFalse(extractUriTemplate("{#list}", "#red,green,blue")));
  Deno.test("Template [{#list*}] does not match URI [#red,green,blue]", () =>
    assertFalse(extractUriTemplate("{#list*}", "#red,green,blue")));
  Deno.test("Template [{#keys}] does not match URI [#semi,;,dot,.,comma,,]", () =>
    assertFalse(extractUriTemplate("{#keys}", "#semi,;,dot,.,comma,,")));
  Deno.test("Template [{#keys*}] does not match URI [#semi=;,dot=.,comma=,]", () =>
    assertFalse(extractUriTemplate("{#keys*}", "#semi=;,dot=.,comma=,")));
  Deno.test("Template [{.who}] matches URI [.fred]", () =>
    assert(extractUriTemplate("{.who}", ".fred")));
  Deno.test("Template [{.who,who}] does not match URI [.fred.fred]", () =>
    assertFalse(extractUriTemplate("{.who,who}", ".fred.fred")));
  Deno.test("Template [{.half,who}] does not match URI [.50%25.fred]", () =>
    assertFalse(extractUriTemplate("{.half,who}", ".50%25.fred")));
  Deno.test("Template [www{.dom*}] does not match URI [www.example.com]", () =>
    assertFalse(extractUriTemplate("www{.dom*}", "www.example.com")));
  Deno.test("Template [X{.var}] matches URI [X.value]", () =>
    assert(extractUriTemplate("X{.var}", "X.value")));
  Deno.test("Template [X{.empty}] matches URI [X.]", () =>
    assert(extractUriTemplate("X{.empty}", "X.")));
  Deno.test("Template [X{.v}] matches URI [X.]", () => assert(extractUriTemplate("X{.v}", "X.")));
  Deno.test("Template [X{.var:3}] matches URI [X.val]", () =>
    assert(extractUriTemplate("X{.var:3}", "X.val")));
  Deno.test("Template [X{.list}] does not match URI [X.red,green,blue]", () =>
    assertFalse(extractUriTemplate("X{.list}", "X.red,green,blue")));
  Deno.test("Template [X{.list*}] does not match URI [X.red.green.blue]", () =>
    assertFalse(extractUriTemplate("X{.list*}", "X.red.green.blue")));
  Deno.test("Template [X{.keys}] does not match URI [X.semi,%3B,dot,.,comma,%2C]", () =>
    assertFalse(
      extractUriTemplate("X{.keys}", "X.semi,%3B,dot,.,comma,%2C"),
    ));
  Deno.test("Template [X{.keys*}] does not match URI [X.semi=%3B.dot=..comma=%2C]", () =>
    assertFalse(
      extractUriTemplate("X{.keys*}", "X.semi=%3B.dot=..comma=%2C"),
    ));
  Deno.test("Template [X{.empty_keys}] does not match URI [X]", () =>
    assertFalse(extractUriTemplate("X{.empty_keys}", "X")));
  Deno.test("Template [X{.empty_keys*}] does not match URI [X]", () =>
    assertFalse(extractUriTemplate("X{.empty_keys*}", "X")));
  Deno.test("Template [{/who}] matches URI [/fred]", () =>
    assert(extractUriTemplate("{/who}", "/fred")));
  Deno.test("Template [{/who,who}] does not match URI [/fred/fred]", () =>
    assertFalse(extractUriTemplate("{/who,who}", "/fred/fred")));
  Deno.test("Template [{/half,who}] matches URI [/50%25/fred]", () =>
    assert(extractUriTemplate("{/half,who}", "/50%25/fred")));
  Deno.test("Template [{/who,dub}] matches URI [/fred/me%2Ftoo]", () =>
    assert(extractUriTemplate("{/who,dub}", "/fred/me%2Ftoo")));
  Deno.test("Template [{/var}] matches URI [/value]", () =>
    assert(extractUriTemplate("{/var}", "/value")));
  Deno.test("Template [{/var,empty}] matches URI [/value/]", () =>
    assert(extractUriTemplate("{/var,empty}", "/value/")));
  Deno.test("Template [{/var,undef}] matches URI [/value]", () =>
    assert(extractUriTemplate("{/var,undef}", "/value")));
  Deno.test("Template [{/var,x}/here] matches URI [/value/1024/here]", () =>
    assert(extractUriTemplate("{/var,x}/here", "/value/1024/here")));
  Deno.test("Template [{/var:1,var}] matches URI [/v/value]", () =>
    assert(extractUriTemplate("{/var:1,var}", "/v/value")));
  Deno.test("Template [{/list}] matches URI [/red,green,blue]", () =>
    assert(extractUriTemplate("{/list}", "/red,green,blue")));
  Deno.test("Template [{/list*}] matches URI [/red/green/blue]", () =>
    assert(extractUriTemplate("{/list*}", "/red/green/blue")));
  Deno.test("Template [{/list*,path:4}] matches URI [/red/green/blue/%2Ffoo]", () =>
    assert(
      extractUriTemplate("{/list*,path:4}", "/red/green/blue/%2Ffoo"),
    ));
  Deno.test("Template [{/keys}] does not match URI [/semi,%3B,dot,.,comma,%2C]", () =>
    assertFalse(
      extractUriTemplate("{/keys}", "/semi,%3B,dot,.,comma,%2C"),
    ));
  Deno.test("Template [{/keys*}] does not match URI [/semi=%3B/dot=./comma=%2C]", () =>
    assertFalse(
      extractUriTemplate("{/keys*}", "/semi=%3B/dot=./comma=%2C"),
    ));
  Deno.test("Template [{;who}] matches URI [;who=fred]", () =>
    assert(extractUriTemplate("{;who}", ";who=fred")));
  Deno.test("Template [{;half}] matches URI [;half=50%25]", () =>
    assert(extractUriTemplate("{;half}", ";half=50%25")));
  Deno.test("Template [{;empty}] matches URI [;empty]", () =>
    assert(extractUriTemplate("{;empty}", ";empty")));
  Deno.test("Template [{;v,empty,who}] matches URI [;v=6;empty;who=fred]", () =>
    assert(extractUriTemplate("{;v,empty,who}", ";v=6;empty;who=fred")));
  Deno.test("Template [{;v,bar,who}] matches URI [;v=6;who=fred]", () =>
    assert(extractUriTemplate("{;v,bar,who}", ";v=6;who=fred")));
  Deno.test("Template [{;x,y}] matches URI [;x=1024;y=768]", () =>
    assert(extractUriTemplate("{;x,y}", ";x=1024;y=768")));
  Deno.test("Template [{;x,y,empty}] matches URI [;x=1024;y=768;empty]", () =>
    assert(extractUriTemplate("{;x,y,empty}", ";x=1024;y=768;empty")));
  Deno.test("Template [{;x,y,undef}] matches URI [;x=1024;y=768]", () =>
    assert(extractUriTemplate("{;x,y,undef}", ";x=1024;y=768")));
  Deno.test("Template [{;hello:5}] matches URI [;hello=Hello]", () =>
    assert(extractUriTemplate("{;hello:5}", ";hello=Hello")));
  Deno.test("Template [{;list}] matches URI [;list=red,green,blue]", () =>
    assert(extractUriTemplate("{;list}", ";list=red,green,blue")));
  Deno.test("Template [{;list*}] matches URI [;list=red;list=green;list=blue]", () =>
    assert(
      extractUriTemplate("{;list*}", ";list=red;list=green;list=blue"),
    ));
  Deno.test("Template [{;keys}] does not match URI [;keys=semi,%3B,dot,.,comma,%2C]", () =>
    assertFalse(
      extractUriTemplate("{;keys}", ";keys=semi,%3B,dot,.,comma,%2C"),
    ));
  Deno.test("Template [{;keys*}] does not match URI [;semi=%3B;dot=.;comma=%2C]", () =>
    assertFalse(
      extractUriTemplate("{;keys*}", ";semi=%3B;dot=.;comma=%2C"),
    ));
  Deno.test("Template [{?who}] matches URI [?who=fred]", () =>
    assert(extractUriTemplate("{?who}", "?who=fred")));
  Deno.test("Template [{?half}] matches URI [?half=50%25]", () =>
    assert(extractUriTemplate("{?half}", "?half=50%25")));
  Deno.test("Template [{?x,y}] matches URI [?x=1024&y=768]", () =>
    assert(extractUriTemplate("{?x,y}", "?x=1024&y=768")));
  Deno.test("Template [{?x,y,empty}] matches URI [?x=1024&y=768&empty=]", () =>
    assert(extractUriTemplate("{?x,y,empty}", "?x=1024&y=768&empty=")));
  Deno.test("Template [{?x,y,undef}] matches URI [?x=1024&y=768]", () =>
    assert(extractUriTemplate("{?x,y,undef}", "?x=1024&y=768")));
  Deno.test("Template [{?var:3}] matches URI [?var=val]", () =>
    assert(extractUriTemplate("{?var:3}", "?var=val")));
  Deno.test("Template [{?list}] matches URI [?list=red,green,blue]", () =>
    assert(extractUriTemplate("{?list}", "?list=red,green,blue")));
  Deno.test("Template [{?list*}] matches URI [?list=red&list=green&list=blue]", () =>
    assert(
      extractUriTemplate("{?list*}", "?list=red&list=green&list=blue"),
    ));
  Deno.test("Template [{?keys}] does not match URI [?keys=semi,%3B,dot,.,comma,%2C]", () =>
    assertFalse(
      extractUriTemplate("{?keys}", "?keys=semi,%3B,dot,.,comma,%2C"),
    ));
  Deno.test("Template [{?keys*}] does not match URI [?semi=%3B&dot=.&comma=%2C]", () =>
    assertFalse(
      extractUriTemplate("{?keys*}", "?semi=%3B&dot=.&comma=%2C"),
    ));
  Deno.test("Template [{&who}] matches URI [&who=fred]", () =>
    assert(extractUriTemplate("{&who}", "&who=fred")));
  Deno.test("Template [{&half}] matches URI [&half=50%25]", () =>
    assert(extractUriTemplate("{&half}", "&half=50%25")));
  Deno.test("Template [?fixed=yes{&x}] matches URI [?fixed=yes&x=1024]", () =>
    assert(extractUriTemplate("?fixed=yes{&x}", "?fixed=yes&x=1024")));
  Deno.test("Template [{&x,y,empty}] matches URI [&x=1024&y=768&empty=]", () =>
    assert(extractUriTemplate("{&x,y,empty}", "&x=1024&y=768&empty=")));
  Deno.test("Template [{&x,y,undef}] matches URI [&x=1024&y=768]", () =>
    assert(extractUriTemplate("{&x,y,undef}", "&x=1024&y=768")));
  Deno.test("Template [{&var:3}] matches URI [&var=val]", () =>
    assert(extractUriTemplate("{&var:3}", "&var=val")));
  Deno.test("Template [{&list}] matches URI [&list=red,green,blue]", () =>
    assert(extractUriTemplate("{&list}", "&list=red,green,blue")));
  Deno.test("Template [{&list*}] matches URI [&list=red&list=green&list=blue]", () =>
    assert(
      extractUriTemplate("{&list*}", "&list=red&list=green&list=blue"),
    ));
  Deno.test("Template [{&keys}] does not match URI [&keys=semi,%3B,dot,.,comma,%2C]", () =>
    assertFalse(
      extractUriTemplate("{&keys}", "&keys=semi,%3B,dot,.,comma,%2C"),
    ));
  Deno.test("Template [{&keys*}] does not match URI [&semi=%3B&dot=.&comma=%2C]", () =>
    assertFalse(
      extractUriTemplate("{&keys*}", "&semi=%3B&dot=.&comma=%2C"),
    ));
  Deno.test("Template [{special_chars}] matches URI [2001%3Adb8%3A%3A35]", () =>
    assert(extractUriTemplate("{special_chars}", "2001%3Adb8%3A%3A35")));
  // endregion
}
