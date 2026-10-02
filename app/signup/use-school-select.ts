"use client";

import { useEffect, useState } from "react";
import type { NeisSchool } from "@/lib/types";

/** /api/neis 중계 응답만 쓴다 (N1-d). 실패하면 메시지를 던진다. */
async function neis<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "학교 목록을 불러오지 못했어요.");
  return body;
}

/**
 * 학교 선택 3단계 (시/도 → 지역 → 학교). 앞 단계를 고르기 전에는 다음 목록을 부르지 않는다.
 * 목록은 전부 /api/neis/* 응답에서만 채운다.
 */
export function useSchoolSelect() {
  const [sidoList, setSidoList] = useState<string[]>([]);
  const [regionList, setRegionList] = useState<string[]>([]);
  const [schoolList, setSchoolList] = useState<NeisSchool[]>([]);
  const [sido, setSido] = useState("");
  const [region, setRegion] = useState("");
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
    if (!sido || !region) return;
    let alive = true;
    neis<{ schools: NeisSchool[] }>(
      `/api/neis/schools?sido=${encodeURIComponent(sido)}&region=${encodeURIComponent(region)}`,
    )
      .then((d) => alive && setSchoolList(d.schools))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [sido, region]);

  const chooseSido = (v: string) => {
    if (v === sido) return;
    setSido(v);
    setRegion("");
    setSchool("");
    setRegionList([]);
    setSchoolList([]);
    setLoadError(null);
  };

  const chooseRegion = (v: string) => {
    if (v === region) return;
    setRegion(v);
    setSchool("");
    setSchoolList([]);
    setLoadError(null);
  };

  return {
    sidoList,
    regionList,
    schoolList,
    sido,
    region,
    school,
    loadError,
    chooseSido,
    chooseRegion,
    chooseSchool: setSchool,
    /** 고른 단계 수 (0~3) */
    done: [sido, region, school].filter(Boolean).length,
  };
}
