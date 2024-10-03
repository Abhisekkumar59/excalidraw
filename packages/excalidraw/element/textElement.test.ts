import { BOUND_TEXT_PADDING, FONT_FAMILY } from "../constants";
import { getLineHeight } from "../fonts";
import { API } from "../tests/helpers/api";
import {
  computeContainerDimensionForBoundText,
  getContainerCoords,
  getBoundTextMaxWidth,
  getBoundTextMaxHeight,
  wrapText,
  detectLineHeight,
  getLineHeightInPx,
} from "./textElement";
import type { ExcalidrawTextElementWithContainer, FontString } from "./types";

describe("Test wrapText", () => {
  // font is irrelevant as jsdom does not support FontFace API
  // `measureText` width is mocked to return `text.length` by `jest-canvas-mock`
  // https://github.com/hustcc/jest-canvas-mock/blob/master/src/classes/TextMetrics.js
  const font = "10px Cascadia, Segoe UI Emoji" as FontString;

  it("should wrap the text correctly when word length is exactly equal to max width", () => {
    const text = "Hello Excalidraw";
    // Length of "Excalidraw" is 100 and exacty equal to max width
    const res = wrapText(text, font, 100);
    expect(res).toEqual(`Hello\nExcalidraw`);
  });

  it("should return the text as is if max width is invalid", () => {
    const text = "Hello Excalidraw";
    expect(wrapText(text, font, NaN)).toEqual(text);
    expect(wrapText(text, font, -1)).toEqual(text);
    expect(wrapText(text, font, Infinity)).toEqual(text);
  });

  it("should show the text correctly when max width reached", () => {
    const text = "Hello😀";
    const maxWidth = 10;
    const res = wrapText(text, font, maxWidth);
    expect(res).toBe("H\ne\nl\nl\no\n😀");
  });

  it("should support multiple (multi-codepoint) emojis", () => {
    const text = "😀🗺🔥";
    const maxWidth = 1;
    const res = wrapText(text, font, maxWidth);
    expect(res).toBe("😀\n🗺\n🔥");
  });

  it("should wrap the text correctly when text contains hyphen", () => {
    let text =
      "Wikipedia is hosted by Wikimedia- Foundation, a non-profit organization that also hosts a range-of other projects";
    const res = wrapText(text, font, 110);
    expect(res).toBe(
      `Wikipedia\nis hosted\nby\nWikimedia-\nFoundation,\na non-\nprofit\norganizatio\nn that also\nhosts a\nrange-of\nother\nprojects`,
    );

    text = "Hello thereusing-now";
    expect(wrapText(text, font, 100)).toEqual("Hello\nthereusing\n-now");
  });

  it("should support wrapping nested lists", () => {
    const text = `\tA) one tab\t\t- two tabs        - 8 spaces`;

    const maxWidth = 100;
    const res = wrapText(text, font, maxWidth);
    expect(res).toBe(`\tA) one\ntab\t\t- two\ntabs\n- 8 spaces`);

    const maxWidth2 = 50;
    const res2 = wrapText(text, font, maxWidth2);
    expect(res2).toBe(`\tA)\none\ntab\n- two\ntabs\n- 8\nspace\ns`);
  });

  // everything else is up to the splitter
  // - multiple CJK, latin and emojis
  // - break always (common)
  // - break after not before
  // - break before not after (pairs)
  describe("When text is CJK", () => {
    it("should break each CJK character when width is very small", () => {
      // "안녕하세요" (Hangul) + "こんにちは世界" (Hiragana, Kanji) + "ｺﾝﾆﾁハ" (Katakana) + "你好" (Han) = "Hello Hello World Hello Hi"
      const text = "안녕하세요こんにちは世界ｺﾝﾆﾁハ你好";
      const maxWidth = 10;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe(
        "안\n녕\n하\n세\n요\nこ\nん\nに\nち\nは\n世\n界\nｺ\nﾝ\nﾆ\nﾁ\nハ\n你\n好",
      );
    });

    it("should break CJK text into longer segments when width is larger", () => {
      // "안녕하세요" (Hangul) + "こんにちは世界" (Hiragana, Kanji) + "ｺﾝﾆﾁハ" (Katakana) + "你好" (Han) = "Hello Hello World Hello Hi"
      const text = "안녕하세요こんにちは世界ｺﾝﾆﾁハ你好";
      const maxWidth = 30;
      const res = wrapText(text, font, maxWidth);

      // measureText is mocked, so it's not precisely what would happen in prod
      expect(res).toBe("안녕하\n세요こ\nんにち\nは世界\nｺﾝﾆ\nﾁハ你\n好");
    });

    it("should handle a combination of CJK, latin, emojis and whitespaces", () => {
      const text = `a醫 醫      bb  你好  world-i-😀🗺🔥`;

      const maxWidth = 150;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe(`a醫 醫      bb  你\n好  world-i-😀🗺\n🔥`);

      const maxWidth2 = 50;
      const res2 = wrapText(text, font, maxWidth2);
      expect(res2).toBe(`a醫 醫\nbb  你\n好\nworld\n-i-😀\n🗺🔥`);

      const maxWidth3 = 30;
      const res3 = wrapText(text, font, maxWidth3);
      expect(res3).toBe(`a醫\n醫\nbb\n你好\nwor\nld-\ni-\n😀\n🗺\n🔥`);
    });

    it("should break before and after a regular CJK character", () => {
      const text = "HelloたWorld";
      const maxWidth1 = 50;
      const res1 = wrapText(text, font, maxWidth1);
      expect(res1).toBe("Hello\nた\nWorld");

      const maxWidth2 = 60;
      const res2 = wrapText(text, font, maxWidth2);
      expect(res2).toBe("Helloた\nWorld");
    });

    it("should break before and after certain CJK symbols", () => {
      const text = "こんにちは・世界";
      const maxWidth1 = 50;
      const res1 = wrapText(text, font, maxWidth1);
      expect(res1).toBe("こんにちは\n・世界");

      const maxWidth2 = 60;
      const res2 = wrapText(text, font, maxWidth2);
      expect(res2).toBe("こんにちは・\n世界");
    });

    it("should break after, not before for certain CJK pairs", () => {
      const text = "Hello た。";
      const maxWidth = 70;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("Hello\nた。");
    });

    it("should break before, not after for certain CJK pairs", () => {
      const text = "Hello「たWorld」";
      const maxWidth = 60;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("Hello\n「た\nWorld」");
    });

    it("should break after, not before for certain CJK character pairs", () => {
      const text = "「Helloた」World";
      const maxWidth = 70;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("「Hello\nた」World");
    });

    it("should break regular Chinese sentences", () => {
      const text = `中国你好！这是一个测试。
我们来看看：人民币¥1234「很贵」
（括号）、逗号，句号。空格 换行　全角符号…—`;

      const maxWidth1 = 80;
      const res1 = wrapText(text, font, maxWidth1);
      expect(res1).toBe(`中国你好！这是一\n个测试。
我们来看看：人民\n币¥1234「很\n贵」
（括号）、逗号，\n句号。空格 换行\n全角符号…—`);

      const maxWidth2 = 50;
      const res2 = wrapText(text, font, maxWidth2);
      expect(res2).toBe(`中国你好！\n这是一个测\n试。
我们来看\n看：人民币\n¥1234\n「很贵」
（括号）、\n逗号，句\n号。空格\n换行　全角\n符号…—`);
    });
  });

  it("should break regular Japanese sentences", () => {
    const text = `日本こんにちは！これはテストです。
  見てみましょう：円￥1234「高い」
  （括弧）、読点、句点。
  空白 改行　全角記号…ー`;

    const maxWidth1 = 80;
    const res1 = wrapText(text, font, maxWidth1);
    expect(res1).toBe(`日本こんにちは！\nこれはテストで\nす。
  見てみましょ\nう：円￥1234\n「高い」
  （括弧）、読\n点、句点。
  空白 改行\n全角記号…ー`);

    const maxWidth2 = 50;
    const res2 = wrapText(text, font, maxWidth2);
    expect(res2).toBe(`日本こんに\nちは！これ\nはテストで\nす。
  見てみ\nましょう：\n円\n￥1234\n「高い」
  （括\n弧）、読\n点、句点。
  空白\n改行　全角\n記号…ー`);
  });

  it("should break regular Korean sentences", () => {
    const text = `한국 안녕하세요! 이것은 테스트입니다.
우리 보자: 원화₩1234「비싸다」
(괄호), 쉼표, 마침표.
공백 줄바꿈　전각기호…—`;

    const maxWidth = 60;
    const res = wrapText(text, font, maxWidth);
    expect(res).toBe(`한국 안녕하\n세요! 이것\n은 테스트입\n니다.
우리 보자:\n원화\n₩1234\n「비싸다」
(괄호),\n쉼표, 마침\n표.
공백 줄바꿈\n전각기호…—`);
  });

  describe("When text contains leading whitespaces", () => {
    const text = "  \t   Hello world";

    it("should preserve leading whitespaces", () => {
      const maxWidth = 120;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("  \t   Hello\nworld");
    });

    it("should break and collapse leading whitespaces when line breaks", () => {
      const maxWidth = 60;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("\nHello\nworld");
    });

    it("should break and collapse leading whitespaces whe words break", () => {
      const maxWidth = 30;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("\nHel\nlo\nwor\nld");
    });
  });

  describe("When text contains trailing whitespaces", () => {
    it("shouldn't add new lines for trailing spaces", () => {
      const text = "Hello whats up     ";
      const maxWidth = 200 - BOUND_TEXT_PADDING * 2;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe(text);
    });

    it("should ignore trailing whitespaces when line breaks", () => {
      const text = "Hippopotomonstrosesquippedaliophobia        ??????";
      const maxWidth = 400;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("Hippopotomonstrosesquippedaliophobia\n??????");
    });

    it("should not ignore trailing whitespaces when word breaks", () => {
      const text = "Hippopotomonstrosesquippedaliophobia        ??????";
      const maxWidth = 300;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("Hippopotomonstrosesquippedalio\nphobia        ??????");
    });

    it("should ignore trailing whitespaces when word breaks and line breaks", () => {
      const text = "Hippopotomonstrosesquippedaliophobia        ??????";
      const maxWidth = 180;
      const res = wrapText(text, font, maxWidth);
      expect(res).toBe("Hippopotomonstrose\nsquippedaliophobia\n??????");
    });
  });

  describe("When text doesn't contain new lines", () => {
    const text = "Hello whats up";

    [
      {
        desc: "break all words when width of each word is less than container width",
        width: 80,
        res: `Hello\nwhats\nup`,
      },
      {
        desc: "break all characters when width of each character is less than container width",
        width: 25,
        res: `H
e
l
l
o
w
h
a
t
s
u
p`,
      },
      {
        desc: "break words as per the width",

        width: 140,
        res: `Hello whats\nup`,
      },
      {
        desc: "fit the container",

        width: 250,
        res: "Hello whats up",
      },
      {
        desc: "should push the word if its equal to max width",
        width: 60,
        res: `Hello
whats
up`,
      },
    ].forEach((data) => {
      it(`should ${data.desc}`, () => {
        const res = wrapText(text, font, data.width - BOUND_TEXT_PADDING * 2);
        expect(res).toEqual(data.res);
      });
    });
  });

  describe("When text contain new lines", () => {
    const text = `Hello
whats up`;
    [
      {
        desc: "break all words when width of each word is less than container width",
        width: 80,
        res: `Hello\nwhats\nup`,
      },
      {
        desc: "break all characters when width of each character is less than container width",
        width: 25,
        res: `H
e
l
l
o
w
h
a
t
s
u
p`,
      },
      {
        desc: "break words as per the width",

        width: 150,
        res: `Hello
whats up`,
      },
      {
        desc: "fit the container",

        width: 250,
        res: `Hello
whats up`,
      },
    ].forEach((data) => {
      it(`should respect new lines and ${data.desc}`, () => {
        const res = wrapText(text, font, data.width - BOUND_TEXT_PADDING * 2);
        expect(res).toEqual(data.res);
      });
    });
  });

  describe("When text is long", () => {
    const text = `hellolongtextthisiswhatsupwithyouIamtypingggggandtypinggg break it now`;
    [
      {
        desc: "fit characters of long string as per container width",
        width: 170,
        res: `hellolongtextthi\nsiswhatsupwithyo\nuIamtypingggggan\ndtypinggg break\nit now`,
      },
      {
        desc: "fit characters of long string as per container width and break words as per the width",

        width: 130,
        res: `hellolongtex
tthisiswhats
upwithyouIam
typingggggan
dtypinggg
break it now`,
      },
      {
        desc: "fit the long text when container width is greater than text length and move the rest to next line",

        width: 600,
        res: `hellolongtextthisiswhatsupwithyouIamtypingggggandtypinggg\nbreak it now`,
      },
    ].forEach((data) => {
      it(`should ${data.desc}`, () => {
        const res = wrapText(text, font, data.width - BOUND_TEXT_PADDING * 2);
        expect(res).toEqual(data.res);
      });
    });
  });
});

describe("Test measureText", () => {
  describe("Test getContainerCoords", () => {
    const params = { width: 200, height: 100, x: 10, y: 20 };

    it("should compute coords correctly when ellipse", () => {
      const element = API.createElement({
        type: "ellipse",
        ...params,
      });
      expect(getContainerCoords(element)).toEqual({
        x: 44.2893218813452455,
        y: 39.64466094067262,
      });
    });

    it("should compute coords correctly when rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        ...params,
      });
      expect(getContainerCoords(element)).toEqual({
        x: 15,
        y: 25,
      });
    });

    it("should compute coords correctly when diamond", () => {
      const element = API.createElement({
        type: "diamond",
        ...params,
      });
      expect(getContainerCoords(element)).toEqual({
        x: 65,
        y: 50,
      });
    });
  });

  describe("Test computeContainerDimensionForBoundText", () => {
    const params = {
      width: 178,
      height: 194,
    };

    it("should compute container height correctly for rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        ...params,
      });
      expect(computeContainerDimensionForBoundText(150, element.type)).toEqual(
        160,
      );
    });

    it("should compute container height correctly for ellipse", () => {
      const element = API.createElement({
        type: "ellipse",
        ...params,
      });
      expect(computeContainerDimensionForBoundText(150, element.type)).toEqual(
        226,
      );
    });

    it("should compute container height correctly for diamond", () => {
      const element = API.createElement({
        type: "diamond",
        ...params,
      });
      expect(computeContainerDimensionForBoundText(150, element.type)).toEqual(
        320,
      );
    });
  });

  describe("Test getBoundTextMaxWidth", () => {
    const params = {
      width: 178,
      height: 194,
    };

    it("should return max width when container is rectangle", () => {
      const container = API.createElement({ type: "rectangle", ...params });
      expect(getBoundTextMaxWidth(container, null)).toBe(168);
    });

    it("should return max width when container is ellipse", () => {
      const container = API.createElement({ type: "ellipse", ...params });
      expect(getBoundTextMaxWidth(container, null)).toBe(116);
    });

    it("should return max width when container is diamond", () => {
      const container = API.createElement({ type: "diamond", ...params });
      expect(getBoundTextMaxWidth(container, null)).toBe(79);
    });
  });

  describe("Test getBoundTextMaxHeight", () => {
    const params = {
      width: 178,
      height: 194,
      id: '"container-id',
    };

    const boundTextElement = API.createElement({
      type: "text",
      id: "text-id",
      x: 560.51171875,
      y: 202.033203125,
      width: 154,
      height: 175,
      fontSize: 20,
      fontFamily: 1,
      text: "Excalidraw is a\nvirtual \nopensource \nwhiteboard for \nsketching \nhand-drawn like\ndiagrams",
      textAlign: "center",
      verticalAlign: "middle",
      containerId: params.id,
    }) as ExcalidrawTextElementWithContainer;

    it("should return max height when container is rectangle", () => {
      const container = API.createElement({ type: "rectangle", ...params });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(184);
    });

    it("should return max height when container is ellipse", () => {
      const container = API.createElement({ type: "ellipse", ...params });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(127);
    });

    it("should return max height when container is diamond", () => {
      const container = API.createElement({ type: "diamond", ...params });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(87);
    });

    it("should return max height when container is arrow", () => {
      const container = API.createElement({
        type: "arrow",
        ...params,
      });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(194);
    });

    it("should return max height when container is arrow and height is less than threshold", () => {
      const container = API.createElement({
        type: "arrow",
        ...params,
        height: 70,
        boundElements: [{ type: "text", id: "text-id" }],
      });

      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(
        boundTextElement.height,
      );
    });
  });
});

const textElement = API.createElement({
  type: "text",
  text: "Excalidraw is a\nvirtual \nopensource \nwhiteboard for \nsketching \nhand-drawn like\ndiagrams",
  fontSize: 20,
  fontFamily: 1,
  height: 175,
});

describe("Test detectLineHeight", () => {
  it("should return correct line height", () => {
    expect(detectLineHeight(textElement)).toBe(1.25);
  });
});

describe("Test getLineHeightInPx", () => {
  it("should return correct line height", () => {
    expect(
      getLineHeightInPx(textElement.fontSize, textElement.lineHeight),
    ).toBe(25);
  });
});

describe("Test getDefaultLineHeight", () => {
  it("should return line height using default font family when not passed", () => {
    //@ts-ignore
    expect(getLineHeight()).toBe(1.25);
  });

  it("should return line height using default font family for unknown font", () => {
    const UNKNOWN_FONT = 5;
    expect(getLineHeight(UNKNOWN_FONT)).toBe(1.25);
  });

  it("should return correct line height", () => {
    expect(getLineHeight(FONT_FAMILY.Cascadia)).toBe(1.2);
  });
});
