interface NotesSectionProps {
  notes: string;
}

export function NotesSection({ notes }: NotesSectionProps) {
  return (
    <div className="flex w-full flex-col gap-2">
      <h3 className="font-heading text-[15px] font-semibold text-cute-text">Notes</h3>
      <div className="w-full rounded-cute-m bg-cute-surface-alt p-4">
        <p className="font-body text-[13px] leading-[1.5] text-cute-text">{notes}</p>
      </div>
    </div>
  );
}
