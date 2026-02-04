let FILENAME = '';
let FILECONTENTS = () => document.getElementById("output").textContent;
// Get references to the input and output elements
const inputElement = document.getElementById('console-input');
const outputElement = document.getElementById('console-output');

// Function to log messages to the custom output area
function logToConsole(message) {
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
        const command = inputElement.value;
        
        switch(command.toLowerCase()){
            case 'clear':
                outputElement.innerHTML = ''; // Clear output
            break;
            case 'debug':
                debug = !debug;
                logToConsole(`Changed debug mode to ${debug}`); 
            break;
            case FILENAME:
                logToConsole(`Reloaded ${FILENAME}`); 
                conSystem = new constraintSystem(Dfs);
                parser(FILECONTENTS(),conSystem); 
                break;
            default:
                logToConsole(command)
                if(!conSystem.parseSystem(command)) 
                    logToConsole('Unknown command:' + command)
        }
        

        inputElement.value = ''; 
    }
});


document.getElementById('fileInput').addEventListener('change', event => {
    const file = event.target.files[0]; // Get the selected file
    if (file) {
        const reader = new FileReader();

        reader.onload = function(e) {
            const fileContents = e.target.result;
            document.getElementById('output').textContent = fileContents; // Display the content 
            conSystem = new constraintSystem(Dfs)
            logToConsole(`Custom console for ${file.name} | 'clear' to clear | 'debug' to change debug mode | 'file name.csp' reloads the current file | Any other code can be added through the console`);
            logToConsole(`Initial Assignment:`)
            FILENAME = file.name;
            parser(fileContents,conSystem); 
        };

        reader.onerror = function(e) {
            console.error("Error reading file: ", e.target.error);
        };
        reader.readAsText(file); // Read the file as text
    }
});
function downloadFile(content, fileName, contentType) {
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

document.getElementById('save-button').addEventListener('click', () => {
  downloadFile(FILECONTENTS(),FILENAME,'');
});
// Example usage:
// downloadFile("Hello World", "test.txt", "text/plain");
