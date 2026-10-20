/** The phone's keychain for the kit's tests: one saved theme choice the tests set. */
let saved: string | null = null;

export function setSavedForTest(value: string | null) {
  saved = value;
}

export function getItemAsync(): Promise<string | null> {
  return Promise.resolve(saved);
}

export function setItemAsync(_key: string, value: string): Promise<void> {
  saved = value;
  return Promise.resolve();
}
