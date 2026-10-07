"use client";

import { useEffect, useState } from "react";
import type { NeisSchool } from "@/lib/types";
import type { SchoolKind } from "@/lib/school-kinds";

/** /api/neis 중계 응답만 쓴다 (N1-d). 실패하면 메시지를 던진다. */
async function neis<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "학교 목록을 불러오지 못했어요.");
  return body;
}

const keyOf = (sido: string, region: string, kind: string) => `${sido}\u0000${region}\u0000${kind}`;

/**
 * 학교 선택 4단계 (시/도 → 지역 → 학교급 → 학교, d7 §19). 앞 단계를 고르기 전에는 다음 단계를 열지 않는다.
 * 시/도·지역 목록은 세 학교급 전체, 학교 목록은 고른 학교급만 — 전부 /api/neis/* 응답에서만 채운다.
 * 지역·학교급을 바꾸면 학교 선택은 비운다. 시/도를 바꾸면 지역·학교를 비운다(학교급은 그대로).
 */
export function useSchoolSelect() {
  const [sidoList, setSidoList] = useState<string[]>([]);
  const [regionList, setRegionList] = useState<string[]>([]);
  const [schoolList, setSchoolList] = useState<NeisSchool[]>([]);
  /** schoolList 가 어느 (시/도, 지역, 학교급) 응답인지 — 불러오는 중에 "학교 없음"을 띄우지 않게 */
  const [schoolListKey, setSchoolListKey] = useState("");
  const [sido, setSido] = useState("");
  const [region, setRegion] = useState("");
  const [kind, setKind] = useState<SchoolKind | "">("");
  const [school, setSchool] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    neis<{ sido: string[] }>("/api/neis/sido")
      .then((d) => alive && setSidoList(d.sido))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!sido) return;
    let alive = true;
    neis<{ regions: string[] }>(`/api/neis/regions?sido=${encodeURIComponent(sido)}`)
      .then((d) => alive && setRegionList(d.regions))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [sido]);

  useEffect(() => {
    if (!sido || !region || !kind) return;
    let alive = true;
    const q = new URLSearchParams({ sido, region, kind });
    neis<{ schools: NeisSchool[] }>(`/api/neis/schools?${q}`)
      .then((d) => {
        if (!alive) return;
        setSchoolList(d.schools);
        setSchoolListKey(keyOf(sido, region, kind));
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [sido, region, kind]);

  const clearSchool = () => {
    setSchool("");
    setSchoolList([]);
    setSchoolListKey("");
    setLoadError(null);
  };

  const chooseSido = (v: string) => {
    if (v === sido) return;
    setSido(v);
    setRegion("");
    setRegionList([]);
    clearSchool();
  };

  const chooseRegion = (v: string) => {
    if (v === region) return;
    setRegion(v);
    clearSchool();
  };

  const chooseKind = (v: SchoolKind) => {
    if (v === kind) return;
    setKind(v);
    clearSchool();
  };

  const steps = [sido, region, kind, school];
  const firstEmpty = steps.findIndex((s) => !s);
  const schoolsLoaded = !!kind && schoolListKey === keyOf(sido, region, kind);

  return {
    sidoList,
    regionList,
    schoolList,
    sido,
    region,
    kind,
    school,
    loadError,
    chooseSido,
    chooseRegion,
    chooseKind,
    chooseSchool: setSchool,
    /** 이 (시/도, 지역, 학교급)의 학교 목록을 받았는지 */
    schoolsLoaded,
    /** 받은 학교 목록이 0개 (상태 14-no-school) */
    noSchool: schoolsLoaded && schoolList.length === 0,
    /** 앞에서부터 차례로 고른 단계 수 (0~4) */
    done: firstEmpty === -1 ? steps.length : firstEmpty,
    steps: steps.length,
  };
}
