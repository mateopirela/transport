// Admin forms of the road catalog (H4): source and date always required,
// codes, coordinates, hour bands and segment lists.
import { describe, expect, it } from 'vitest';

import { validationMessages as m } from '../copy/validation';
import {
  corridorFormSchema,
  roadSegmentFormSchema,
  segmentRiskFormSchema,
  segmentTollFormSchema,
} from './roads';

const SEGMENT = '7f0d4a4e-3b8c-4f7a-9d55-2f1e7c1b9a10';

function issues(
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      error?: { issues: { path: PropertyKey[]; message: string }[] };
    };
  },
  value: unknown,
) {
  const result = schema.safeParse(value);
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.'), i.message] as const),
  );
}

const segment = {
  code: ' slp-lag ',
  name: 'San Luis Potosí – Lagos de Moreno',
  highway: '80D',
  fromCity: 'San Luis Potosí',
  fromState: 'San Luis Potosí',
  fromLat: '22.1565',
  fromLng: '-100.9855',
  toCity: 'Lagos de Moreno',
  toState: 'Jalisco',
  toLat: '21.3564',
  toLng: '-101.9356',
  distanceKm: '172',
  isToll: true,
  source: 'CAPUFE',
  sourceUrl: 'https://example.test/tarifas.pdf',
  sourceDate: '2026-04-13',
  dataStatus: 'estimated',
};

describe('roadSegmentFormSchema', () => {
  it('parses a segment, upper-casing the code and reading numbers from text', () => {
    const parsed = roadSegmentFormSchema.parse(segment);
    expect(parsed.code).toBe('SLP-LAG');
    expect(parsed.fromLng).toBe(-100.9855);
    expect(parsed.distanceKm).toBe(172);
    expect(parsed.archived).toBe(false);
    expect(parsed.notes).toBeUndefined();
  });

  it('requires the source and its date, and refuses bad codes, links, coordinates and future dates', () => {
    expect(
      issues(roadSegmentFormSchema, { ...segment, source: ' ', sourceDate: undefined }),
    ).toEqual({
      source: m.required,
      sourceDate: m.date,
    });
    expect(
      issues(roadSegmentFormSchema, { ...segment, code: 'slp lag', sourceUrl: 'http://x.test' }),
    ).toEqual({
      code: m.roadCode,
      sourceUrl: m.httpsUrl,
    });
    expect(
      issues(roadSegmentFormSchema, { ...segment, fromLat: '91', toLng: 'abc', distanceKm: '0' }),
    ).toEqual({
      fromLat: m.coordinate,
      toLng: m.coordinate,
      distanceKm: m.positiveNumber,
    });
    expect(issues(roadSegmentFormSchema, { ...segment, sourceDate: '2999-01-01' })).toEqual({
      sourceDate: m.notFuture,
    });
    expect(issues(roadSegmentFormSchema, null)).toEqual({ '': m.required });
  });
});

describe('segmentTollFormSchema', () => {
  const toll = {
    segmentId: SEGMENT,
    vehicleClass: 'c5',
    amountCents: 44_200,
    source: 'CAPUFE',
    validFrom: '2026-04-13',
    dataStatus: 'verified',
  };

  it('takes an amount or null ("Sin dato") for a class', () => {
    expect(segmentTollFormSchema.parse(toll).amountCents).toBe(44_200);
    expect(segmentTollFormSchema.parse({ ...toll, amountCents: null }).amountCents).toBeNull();
    expect(issues(segmentTollFormSchema, { ...toll, vehicleClass: 'c1', amountCents: -1 })).toEqual(
      {
        vehicleClass: m.invalidOption,
        amountCents: m.amount,
      },
    );
    expect(issues(segmentTollFormSchema, { ...toll, amountCents: 20_000_000 })).toEqual({
      amountCents: m.amountTooHigh,
    });
  });
});

describe('segmentRiskFormSchema', () => {
  const risk = {
    segmentId: SEGMENT,
    level: 'high',
    fromHour: '22',
    toHour: '6',
    description: 'Robo a transporte de carga',
    source: 'Reporte público',
    observedOn: '2026-09-30',
    dataStatus: 'estimated',
  };

  it('accepts bands that cross midnight and refuses equal or out-of-range hours', () => {
    expect(segmentRiskFormSchema.parse(risk)).toMatchObject({ fromHour: 22, toHour: 6 });
    expect(issues(segmentRiskFormSchema, { ...risk, toHour: '22' })).toEqual({
      toHour: m.hourBand,
    });
    expect(issues(segmentRiskFormSchema, { ...risk, fromHour: '24', toHour: '25' })).toEqual({
      fromHour: m.hourBand,
      toHour: m.hourBand,
    });
  });
});

describe('corridorFormSchema', () => {
  const corridor = {
    code: 'mty-gdl-slp',
    name: 'MTY–GDL por San Luis Potosí',
    originCity: 'Monterrey',
    originState: 'Nuevo León',
    originLat: '25.6866',
    originLng: '-100.3161',
    originRadiusKm: '60',
    destinationCity: 'Guadalajara',
    destinationState: 'Jalisco',
    destinationLat: '20.6597',
    destinationLng: '-103.3496',
    destinationRadiusKm: '60',
    segmentCodes: 'mty-sal, SAL-MAT  MAT-SLP,',
  };

  it('splits the segment codes in order', () => {
    const parsed = corridorFormSchema.parse(corridor);
    expect(parsed.segmentCodes).toEqual(['MTY-SAL', 'SAL-MAT', 'MAT-SLP']);
    expect(parsed.bidirectional).toBe(true);
  });

  it('needs at least one valid code and a radius', () => {
    expect(issues(corridorFormSchema, { ...corridor, segmentCodes: ' , ' })).toEqual({
      segmentCodes: m.roadSegments,
    });
    expect(
      issues(corridorFormSchema, {
        ...corridor,
        segmentCodes: 'ok-1, mal código',
        originRadiusKm: '0',
      }),
    ).toEqual({
      originRadiusKm: m.positiveNumber,
      'segmentCodes.2': m.roadCode,
    });
  });
});
