interface NotesSectionProps {
  notes: string;
}

export function NotesSection({ notes }: NotesSectionProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <h3 className="font-heading text-cute-15 font-semibold text-cute-text">Notes</h3>
      <div className="w-full rounded-cute-m bg-cute-surface-alt p-4">
        <p className="font-body text-cute-13 leading-[1.5] whitespace-pre-line [overflow-wrap:anywhere] text-cute-text">
          {notes}
        </p>
      </div>
    </div>
  );
}
