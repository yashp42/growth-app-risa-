import { formatContractLine, formatFieldValue, isContractLineArray } from '../../lib/displayFormat';

/** One field value in a change card or confirm dialog: never raw JSON. */
export function FieldValue({ field, value }: { field: string; value: unknown }) {
  if (isContractLineArray(value)) {
    return (
      <span className="inline-flex flex-col gap-0.5">
        {value.map((line, i) => (
          <span key={i} className="tabular-nums">
            {formatContractLine(line)}
          </span>
        ))}
      </span>
    );
  }
  return <span className="tabular-nums">{formatFieldValue(field, value)}</span>;
}
