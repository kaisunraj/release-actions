/**
 * Run git log origin/main..origin/develop --pretty=format:"%s" | grep -oE 'OVP-[0-9]+' | sort -u | xargs -I {} echo "https://tecsagroup.atlassian.net/browse/{}"
 */
function generateReleaseNotes() {
    exec("git log origin/main..origin/develop", (error, stdout, stderr) => {
        if (error) {
            console.error(`Error generating release notes: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Error output: ${stderr}`);
            return;
        }
        console.log(`Release Notes:\n${stdout}`);
    });
