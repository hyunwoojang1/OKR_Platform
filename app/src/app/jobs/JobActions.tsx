import { sendJobCommand } from '@/lib/actions';
import type { JobPosting } from '@/lib/types';

// 공고 카드 버튼: 수집함 → [승격][미지원], 지원예정 → [제출완료][미지원]
// 클릭 = job_commands 큐 등록(로컬 실행기가 폴더 이동) + 화면 즉시 반영
export default function JobActions({ job }: { job: JobPosting }) {
  const buttons =
    job.stage === '지원예정'
      ? [
          { action: 'submitted', label: '제출완료', primary: true },
          { action: 'rejected', label: '미지원', primary: false },
        ]
      : [
          { action: 'promote', label: '승격', primary: true },
          { action: 'rejected', label: '미지원', primary: false },
        ];
  return (
    <div className="flex gap-1.5">
      {buttons.map((b) => (
        <form key={b.action} action={sendJobCommand}>
          <input type="hidden" name="action" value={b.action} />
          <input type="hidden" name="posting_id" value={job.id} />
          <input type="hidden" name="url" value={job.url} />
          <input type="hidden" name="company" value={job.company} />
          <button
            type="submit"
            className="pressable rounded-lg px-2.5 py-1.5 text-xs"
            style={
              b.primary
                ? { background: 'var(--accent-bg)', color: 'var(--accent-deep)', fontWeight: 500 }
                : { border: '1px solid var(--line-strong)', color: 'var(--ink-3)' }
            }
          >
            {b.label}
          </button>
        </form>
      ))}
    </div>
  );
}
