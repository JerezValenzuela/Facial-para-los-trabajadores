import { describe, expect, it } from "vitest";
import { detectMobile } from "@/lib/security/device";
import { getClientIp, isPrivateOrLoopback, normalizeIp, parseIpOrCidr } from "@/lib/security/ip";
import { isValidCedula } from "@/lib/validation";

const DESKTOP = { maxTouchPoints: 0, screenWidth: 1920, screenHeight: 1080, coarsePointer: false, canHover: true };

describe("bloqueo de celulares y tablets", () => {
  it("bloquea Android e iPhone por User-Agent", () => {
    expect(detectMobile("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36", null, DESKTOP).mobile).toBe(true);
    expect(detectMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", null, DESKTOP).mobile).toBe(true);
  });
  it("bloquea por Client Hint Sec-CH-UA-Mobile: ?1", () => {
    expect(detectMobile("Mozilla/5.0 (X11; Linux x86_64) Chrome/140", "?1", DESKTOP).reasons).toContain("client_hint_mobile");
  });
  it("detecta un iPad que se presenta como Mac", () => {
    const v = detectMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", "?0", {
      ...DESKTOP,
      maxTouchPoints: 5,
      screenWidth: 1024,
      screenHeight: 1366,
    });
    expect(v.mobile).toBe(true);
    expect(v.reasons).toContain("ipad_como_mac");
  });
  it("detecta pantalla táctil pequeña sin mouse aunque el UA diga escritorio", () => {
    const v = detectMobile("Mozilla/5.0 (X11; Linux x86_64) Chrome/140", null, {
      maxTouchPoints: 5,
      screenWidth: 412,
      screenHeight: 915,
      coarsePointer: true,
      canHover: false,
    });
    expect(v.mobile).toBe(true);
  });
  it("permite una PC de escritorio normal", () => {
    expect(detectMobile("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36", "?0", DESKTOP).mobile).toBe(false);
  });
  it("permite una laptop con pantalla táctil (tiene mouse/trackpad)", () => {
    const v = detectMobile("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140", "?0", {
      maxTouchPoints: 10,
      screenWidth: 1920,
      screenHeight: 1080,
      coarsePointer: false,
      canHover: true,
    });
    expect(v.mobile).toBe(false);
  });
});

describe("IP del cliente", () => {
  it("toma la primera IP de x-forwarded-for y prioriza la cabecera de Vercel", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "186.4.12.7, 10.0.0.1" }))).toBe("186.4.12.7");
    expect(getClientIp(new Headers({ "x-vercel-forwarded-for": "200.1.1.1", "x-forwarded-for": "1.1.1.1" }))).toBe("200.1.1.1");
    expect(getClientIp(new Headers())).toBeNull();
  });
  it("normaliza puertos, corchetes e IPv4 mapeadas", () => {
    expect(normalizeIp("186.4.12.7:51234")).toBe("186.4.12.7");
    expect(normalizeIp("[2800:bf0::1]:443")).toBe("2800:bf0::1");
    expect(normalizeIp("::ffff:190.1.2.3")).toBe("190.1.2.3");
    expect(normalizeIp("no-es-ip")).toBeNull();
  });
  it("reconoce IPs privadas/locales", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.1.1", "100.64.0.1", "::1"]) {
      expect(isPrivateOrLoopback(ip)).toBe(true);
    }
    expect(isPrivateOrLoopback("186.4.12.7")).toBe(false);
  });
  it("valida IP exacta o rango CIDR con red correcta", () => {
    expect(parseIpOrCidr(" 186.4.12.7 ")).toEqual({ ok: true, value: "186.4.12.7" });
    expect(parseIpOrCidr("186.4.12.0/24")).toEqual({ ok: true, value: "186.4.12.0/24" });
    expect(parseIpOrCidr("186.4.12.7/24")).toMatchObject({ ok: false, error: expect.stringContaining("186.4.12.0/24") });
    expect(parseIpOrCidr("186.4.12.0/4")).toMatchObject({ ok: false });
    expect(parseIpOrCidr("999.1.1.1")).toMatchObject({ ok: false });
  });
});

describe("cédula ecuatoriana", () => {
  it("acepta cédulas con dígito verificador correcto", () => {
    expect(isValidCedula("1712345675")).toBe(true);
    expect(isValidCedula("0926687856")).toBe(true);
  });
  it("rechaza dígito verificador, provincia o formato inválidos", () => {
    expect(isValidCedula("1712345674")).toBe(false);
    expect(isValidCedula("9912345675")).toBe(false);
    expect(isValidCedula("17123456")).toBe(false);
    expect(isValidCedula("17a2345675")).toBe(false);
  });
});
