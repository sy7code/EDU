-- v1.2 QR 전환 정리: FACEPASS 동의는 새로 받지 않음 (옛 행은 이력으로 남김 → NOT VALID: 새 행만 검사)
alter table consents drop constraint if exists consents_no_new_facepass;
alter table consents add constraint consents_no_new_facepass check (kind <> 'FACEPASS') not valid;
