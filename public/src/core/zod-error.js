export function fromError(error) {
  if (!error) {
    const message = "Unknown error";
    return { message, toString() { return message; } };
  }
  const issues = error.issues ?? error.errors;
  if (Array.isArray(issues) && issues.length > 0) {
    const message = issues.map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
      return path ? `${path}: ${issue.message}` : String(issue.message ?? issue);
    }).join("; ");
    return { message, toString() { return message; } };
  }
  const message = error.message ?? String(error);
  return { message, toString() { return message; } };
}
