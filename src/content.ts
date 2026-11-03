let selectedSolver: Solver | undefined;
let fileLoadFailed = false;
const algorithmElement = document.getElementById("algorithm") as HTMLSelectElement;

function enableConsole(enabled: boolean) {
    for (const id of ["fileInput", "dependencyInput", "save-button", "solve-button", "next-button", "stop-button", "console-input"]) {
        (document.getElementById(id) as HTMLInputElement | HTMLButtonElement).disabled = !enabled;
    }
    document.getElementById("output")!.contentEditable = String(enabled);
}
enableConsole(false);
algorithmElement.addEventListener("change", () => {
    solutionSession?.stop();
    selectedSolver = algorithmElement.value === "dfs" ? Dfs : algorithmElement.value === "mac" ? MAC : undefined;
    enableConsole(selectedSolver !== undefined);
    if (!selectedSolver) return;
    conSystem = new constraintSystem(selectedSolver);
    solutionSession = new SolutionSession(conSystem);
    try {
        if (FILENAME) loadBrowserSystem(FILECONTENTS());
        logToConsole(`${algorithmElement.value.toUpperCase()} selected. Load a file, then enter solve.`);
    } catch (error) {
        logToConsole(error instanceof Error ? error.message : String(error));
    }
});

let FILENAME = '';
const dependencySources = new Map<string, string>();
function normalizeCspPath(path: string): string {
    const parts: string[] = [];
    for (const part of path.split('/')) {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
    }
    return parts.join('/');
}
function browserImports(): CspImports {
    const candidates = [...dependencySources.keys()].filter(key => key === FILENAME || key.endsWith('/' + FILENAME));
    if (candidates.length > 1) throw new Error(`Multiple files named ${FILENAME} in dependency folder`);
    return { filename: candidates[0] ?? FILENAME, read(specifier, importer) {
        const id = normalizeCspPath(importer.slice(0, importer.lastIndexOf('/') + 1) + specifier);
        const code = dependencySources.get(id);
        if (code === undefined) throw new Error(`Select the folder containing ${id} using Import folder, then reload`);
        return { id, code };
    } };
}
document.getElementById('dependencyInput')!.addEventListener('change', async event => {
    const files = Array.from((event.target as HTMLInputElement).files ?? []);
    try {
        const sources = await Promise.all(files.filter(file => file.name.endsWith('.csp')).map(async file => {
            const relative = file.webkitRelativePath || file.name;
            const id = file.webkitRelativePath ? relative.slice(relative.indexOf('/') + 1) : relative;
            return [id, await file.text()] as const;
        }));
        dependencySources.clear();
        for (const [id, code] of sources) dependencySources.set(id, code);
        solutionSession?.stop();
        logToConsole('Import folder ready. Load or reload your main .csp file.');
    } catch (error) { logToConsole(String(error)); }
});
let solutionSession: SolutionSession | undefined;
let FILECONTENTS = (): string => document.getElementById("output")!.textContent!;
// Get references to the input and output elements
const inputElement = (document.getElementById('console-input') as HTMLInputElement);
const outputElement = document.getElementById('console-output')!;

// Function to log messages to the custom output area
function logToConsole(message: unknown) {
    const entry = document.createElement('div');
    entry.textContent = '- ' + message;
    entry.style.whiteSpace = 'pre-wrap';
    outputElement.appendChild(entry);
    // Auto-scroll to the bottom
    outputElement.scrollTop = outputElement.scrollHeight;
}

// Add event listener for the Enter key on the input field
inputElement.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        const command = inputElement.value.trim();
        if (!command) return;
        if (!selectedSolver) { logToConsole("Choose a solving algorithm first."); return; }
        if (command === "solve" || command === "next" || command === "stop") {
            runSolutionCommand(command);
            inputElement.value = '';
            return;
        }

        switch (command.toLowerCase()) {
            case 'clear':
                outputElement.innerHTML = ''; // Clear output
                break;
            case 'debug':
                debug = !debug;
                logToConsole(`Changed debug mode to ${debug}`);
                break;
            case "reload":
            case FILENAME.toLowerCase():
                try {
                    loadBrowserSystem(FILECONTENTS());
                    logToConsole(`Reloaded ${FILENAME}`);
                } catch (error) { logToConsole(String(error)); }
                break;
            default:
                solutionSession?.stop();
                logToConsole(command)
                try {
                    parser(command, conSystem, browserImports());
                    break;
                } catch (e) {
                    logToConsole(e)
                }
        }
        inputElement.value = '';

    }
});

document.getElementById('fileInput')!.addEventListener('change', event => {
    const file = (event.target as HTMLInputElement).files?.[0]; // Get the selected file
    if (file) {
        if (!selectedSolver) { logToConsole("Choose a solving algorithm first."); return; }
        const reader = new FileReader();

        reader.onload = function(e) {
            const fileContents = e.target!.result as string;
            document.getElementById('output')!.textContent = fileContents; // Display the content
            solutionSession?.stop();
            logToConsole("CSP solutions: solve | next | stop");
            logToConsole(`Custom console for ${file.name} | 'clear' to clear | 'debug' to change debug mode | 'file name.csp' reloads the current file | Any other code can be added through the console`);
            FILENAME = file.name;
            try { loadBrowserSystem(fileContents); }
            catch (error) { logToConsole(String(error)); }
        };

        reader.onerror = function(e) {
            console.error("Error reading file: ", e.target!.error);
        };
        reader.readAsText(file); // Read the file as text
    }
});
// Commit a file only after all imports and statements load successfully.
function loadBrowserSystem(source: string) {
    solutionSession?.stop();
    fileLoadFailed = true;
    const loaded = new constraintSystem(resolve(selectedSolver, "Choose a solving algorithm first"));
    parser(source, loaded, browserImports());
    conSystem = loaded;
    solutionSession = new SolutionSession(loaded);
    fileLoadFailed = false;
}

function downloadFile(content: string, fileName: string, contentType: string) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });

    // Create a URL for the blob
    a.href = URL.createObjectURL(file);
    a.download = fileName; // Suggested filename

    // Append to body, click, and remove
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(a.href);
    }, 0);
}

document.getElementById('save-button')!.addEventListener('click', () => {
    downloadFile(FILECONTENTS(), FILENAME, '');
});
// Example usage:
// downloadFile("Hello World", "test.txt", "text/plain");

function runSolutionCommand(command: "solve" | "next" | "stop") {
    try {
        if (!selectedSolver) throw new Error("Choose a solving algorithm first.");
        if (!FILENAME) throw new Error("Load a .csp file first.");
        if (fileLoadFailed && command !== "stop") throw new Error("File failed to load. Fix the reported error, select the project root using Import folder if needed, then reload.");
        solutionSession ??= new SolutionSession(conSystem);
        logToConsole(solutionSession.execute(command));
    } catch (error) {
        logToConsole(error instanceof Error ? error.message : String(error));
    }
}

for (const command of ["solve", "next", "stop"] as const) {
    document.getElementById(`${command}-button`)!.addEventListener("click", () => runSolutionCommand(command));
}
document.getElementById("output")!.addEventListener("input", () => solutionSession?.stop());
