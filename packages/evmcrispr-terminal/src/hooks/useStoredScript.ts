import CID from 'cids';
import { useEffect, useState } from 'react';

import fetchPin from '../api/pinata/fetch-pin';
import type { BareScript } from '../types';
import { getScriptSavedInLocalStorage } from '../utils';

function isCID(s: string | undefined) {
  if (!s) return false;
  try {
    new CID(s);
    return true;
  } catch (e) {
    return false;
  }
}

export function useScriptFromId(
  scriptId: string | undefined,
): BareScript | undefined {
  const [script, setScript] = useState<BareScript>();

  useEffect(() => {
    (async () => {
      if (!isCID(scriptId)) {
        setScript(getScriptSavedInLocalStorage(scriptId));
      } else {
        setScript(await fetchPin('https://ipfs.io', scriptId));
      }
    })();
  }, [scriptId]);
  return script;
}
