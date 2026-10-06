import { manualFileKind, type ManualFileKind } from "@/lib/manual-rules";

/** 업로드 영역이 그리는 파일 (이름 · 종류 · 이미지 미리보기 주소) */
export type ManualUploadFile = {
  name: string;
  kind: ManualFileKind;
  /** 이미지 썸네일 주소 (PDF·주소가 없으면 문서 자리 표시) */
  previewUrl?: string | null;
};

/**
 * 고른 File → 업로드 영역에 넘길 값. 이미지는 브라우저 안에서만 쓰는 미리보기 주소(blob:)를 만든다.
 * 허용 형식이 아니면 null (오류 문구는 lib/manual-rules validateManualFile).
 * 파일을 바꾸거나 화면을 떠날 때 releaseManualUploadFile 로 주소를 풀어 준다.
 */
export function createManualUploadFile(file: File): ManualUploadFile | null {
  const kind = manualFileKind(file);
  if (!kind) return null;
  return { name: file.name, kind, previewUrl: kind === "image" ? URL.createObjectURL(file) : null };
}

export function releaseManualUploadFile(file: ManualUploadFile | null | undefined): void {
  if (file?.previewUrl && file.previewUrl.startsWith("blob:")) URL.revokeObjectURL(file.previewUrl);
}
