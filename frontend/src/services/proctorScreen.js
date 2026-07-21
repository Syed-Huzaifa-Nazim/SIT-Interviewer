// Module-level holder for the screen-share MediaStream captured (with a user gesture) on
// the pre-interview gate. A MediaStream can't be passed through React Router location
// state, so the OfficialInterviewStart page stashes it here and the InterviewSession that
// opens after navigation reads it to monitor the candidate's actual computer screen.
let screenStream = null;

export const setScreenStream = (stream) => {
  screenStream = stream || null;
};

export const getScreenStream = () => screenStream;

export const hasScreenStream = () => !!(screenStream && screenStream.active);

// Stop every track and drop the reference — called when the interview ends so the browser
// "you are sharing your screen" indicator clears and the capture stops.
export const clearScreenStream = () => {
  if (screenStream) {
    try {
      screenStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* stream already gone */
    }
    screenStream = null;
  }
};
