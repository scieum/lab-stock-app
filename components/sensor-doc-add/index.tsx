import Link from "next/link";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import { SENSOR_DOC_TEXT } from "@/lib/sensor-doc-rules";
import styles from "./styles.module.css";

export const SENSOR_DOC_PATH = "/sensors/doc";

type Props =
  | {
      /** 데스크톱 목록 머리 button-outline "서류로 등록" (시안 17-desktop) — '센서 등록' 왼쪽 */
      variant: "button";
      href?: string;
      className?: string;
    }
  | {
      /** 모바일 '등록' 시트의 한 줄 "서류로 등록" + caption "품의서·영수증을 AI가 읽어요" (rules sensor.add_mobile) */
      variant: "row";
      href?: string;
      className?: string;
    }
  | {
      /**
       * 서류로 등록 화면 머리 (시안 17-doc-upload · 17-doc-review · 17-doc-fail): 제목 "서류로 등록" +
       * (올리기 전) caption "품의서·영수증을 AI가 읽어요" / (확인) 파일 이름 줄 + "읽은 내용이 맞는지 확인해 주세요".
       * 데스크톱은 왼쪽에 button-pill-soft "센서"(목록으로).
       */
      variant: "head";
      fileName?: string | null;
      backHref?: string;
      className?: string;
    };

/**
 * 센서 서류로 등록 진입·머리 (rules 1.28 sensor.doc.entry, d7 §28 sensor-doc-add). 교사·admin 만 (R5 — 학생 0), 둘러보기 없음.
 */
export function SensorDocAdd(props: Props) {
  if (props.variant === "button") {
    return (
      <div data-component="sensor-doc-add" className={[styles.wrap, props.className ?? ""].filter(Boolean).join(" ")}>
        <ButtonOutline href={props.href ?? SENSOR_DOC_PATH} className={styles.outline}>
          <Icon name="file" className={styles.icon} />
          <span>{SENSOR_DOC_TEXT.entry}</span>
        </ButtonOutline>
      </div>
    );
  }
  if (props.variant === "row") {
    const href = props.href ?? SENSOR_DOC_PATH;
    return (
      <Link
        data-component="sensor-doc-add"
        href={href}
        prefetch={linkPrefetch(href)}
        className={[styles.row, props.className ?? ""].filter(Boolean).join(" ")}
      >
        <Icon name="file" className={styles.rowIcon} />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{SENSOR_DOC_TEXT.entry}</span>
          <span className={styles.caption}>{SENSOR_DOC_TEXT.entryCaption}</span>
        </span>
        <Icon name="chevron-right" className={styles.chevron} />
        <LinkPending />
      </Link>
    );
  }
  const { fileName, backHref = "/sensors", className } = props;
  return (
    <div data-component="sensor-doc-add" className={[styles.head, className ?? ""].filter(Boolean).join(" ")}>
      <ButtonPillSoft href={backHref} leadingIcon="back" className={styles.back}>
        센서
      </ButtonPillSoft>
      <div className={styles.titleBox} data-name="page-title">
        <h1 className={styles.title}>{SENSOR_DOC_TEXT.entry}</h1>
        {fileName ? (
          <p className={styles.fileRow} data-name="doc-file-row">
            <Icon name="file" className={styles.fileIcon} />
            <span className={styles.fileName}>{fileName}</span>
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
            <span className={styles.guide}>{SENSOR_DOC_TEXT.review}</span>
          </p>
        ) : (
          <p className={styles.caption}>{SENSOR_DOC_TEXT.entryCaption}</p>
        )}
      </div>
    </div>
  );
}

type ChoiceProps = {
  docHref?: string;
  directHref: string;
  onClose?: () => void;
  /** true(기본) = tab-bar 위 하단 시트. false = 제자리(갤러리) */
  floating?: boolean;
};

/**
 * 모바일 '등록' 작은 바텀시트 2줄 (rules sensor.add_mobile): sensor-doc-add "서류로 등록"(caption) / "직접 입력"(→ sensor-form).
 */
export function SensorAddChoiceSheet({ docHref, directHref, onClose, floating = true }: ChoiceProps) {
  return (
    <div role="dialog" aria-label="센서 등록" className={[styles.choice, floating ? styles.choiceFloating : ""].filter(Boolean).join(" ")}>
      <div className={styles.choiceHead}>
        <h2 className={styles.choiceTitle}>센서 등록</h2>
        {onClose ? (
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <Icon name="close" className={styles.closeIcon} />
          </button>
        ) : null}
      </div>
      <SensorDocAdd variant="row" href={docHref} />
      <Link href={directHref} prefetch={linkPrefetch(directHref)} className={[styles.row, styles.rowLine].join(" ")}>
        <Icon name="pen" className={styles.rowIcon} />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{SENSOR_DOC_TEXT.direct}</span>
        </span>
        <Icon name="chevron-right" className={styles.chevron} />
        <LinkPending />
      </Link>
    </div>
  );
}
