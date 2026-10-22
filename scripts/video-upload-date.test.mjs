import assert from "node:assert/strict";
import test from "node:test";
import { videoUploadDate } from "./video-upload-date.mjs";

test("normaliza las fechas históricas sin cambiar el día", () => {
  assert.equal(videoUploadDate("2026-10-18"), "2026-10-18T00:00:00-05:00");
  assert.equal(videoUploadDate("2026-10-19"), "2026-10-19T00:00:00-05:00");
  assert.equal(videoUploadDate(), "2026-10-15T00:00:00-05:00");
});

test("completa la zona de Perú si la hora no tiene zona", () => {
  assert.equal(videoUploadDate("2026-10-18T13:20"), "2026-10-18T13:20:00-05:00");
  assert.equal(videoUploadDate("2026-10-18T13:20:12"), "2026-10-18T13:20:12-05:00");
});

test("conserva las horas y zonas explícitas", () => {
  for (const value of ["2026-10-18T13:20:12-05:00", "2026-10-18T18:20:12Z", "2026-10-18T13:20:12.123+02:00"]) {
    assert.equal(videoUploadDate(value), value);
  }
});

test("rechaza fechas, horas y zonas inválidas antes de publicar", () => {
  for (const value of ["", "18/10/2026", "2026-02-29", "2026-04-31", "2026-13-01", "2026-10-18T24:00:00", "2026-10-18T12:60:00", "2026-10-18T12:00:60", "2026-10-18T12:00:00+15:00", "2026-10-18T12:00:00+14:01"]) {
    assert.throws(() => videoUploadDate(value), /uploadDate/);
  }
  assert.equal(videoUploadDate("2024-02-29"), "2024-02-29T00:00:00-05:00");
});
