import * as React from "react";

interface CommonControlledStateProps<T> {
  value?: T;
  defaultValue?: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useControlledState<T, Rest extends any[] = []>(
  props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
  },
): readonly [T, (next: T, ...args: Rest) => void] {
  const { value, defaultValue, onChange } = props;

  const [state, setInternalState] = React.useState<T>(value !== undefined ? value : (defaultValue as T));

  React.useEffect(() => {
    if (value !== undefined) setInternalState(value);
  }, [value]);

  // 受控（有傳 value）時只通知外面、以外面的值為準：外面可以拒絕改變
  // （例如設定頁有未儲存的變更時不讓 Dialog 關掉）；原版會先改內部狀態，外面不同意也已經關了
  const controlled = value !== undefined;
  const setState = React.useCallback(
    (next: T, ...args: Rest) => {
      if (!controlled) setInternalState(next);
      onChange?.(next, ...args);
    },
    [onChange, controlled],
  );

  return [controlled ? value : state, setState] as const;
}
