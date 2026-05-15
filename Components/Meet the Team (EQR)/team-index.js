document.addEventListener("DOMContentLoaded", async () => {
    const configNode = document.getElementById('team-index-config');
    if (!configNode) return;
    
    const config = JSON.parse(configNode.textContent);
    const targetDiv = document.getElementById(config.targetDivId);

    try {
        // 1. Fetch JSON Data and HTML Template concurrently
        const [dataResponse, htmlResponse] = await Promise.all([
            fetch(config.jsonUrl),
            fetch(config.htmlUrl)
        ]);

        if (!dataResponse.ok || !htmlResponse.ok) throw new Error("Failed to fetch data or template.");

        let teamData = await dataResponse.json();
        const htmlTemplate = await htmlResponse.text();

        // 2. Apply Filters (Supports simple AND logic like "Status=1&EQRMember=2")
        if (config.filterField) {
            const filters = new URLSearchParams(config.filterField);
            teamData = teamData.filter(member => {
                let isMatch = true;
                for (const [key, value] of filters.entries()) {
                    // Use loose equality (==) to allow '1' (string) to match 1 (integer)
                    if (member[key] != value) {
                        isMatch = false;
                        break;
                    }
                }
                return isMatch;
            });
        }

        // 3. Extract the repeating part of the HTML template
        const repeatStart = '<!-- START_REPEAT -->';
        const repeatEnd = '<!-- END_REPEAT -->';
        const startIndex = htmlTemplate.indexOf(repeatStart) + repeatStart.length;
        const endIndex = htmlTemplate.indexOf(repeatEnd);
        
        const wrapperStart = htmlTemplate.substring(0, htmlTemplate.indexOf(repeatStart));
        const wrapperEnd = htmlTemplate.substring(endIndex + repeatEnd.length);
        const cardTemplate = htmlTemplate.substring(startIndex, endIndex);

        // 4. Populate Data
        let cardsHtml = '';
        teamData.forEach(member => {
            let cardHtml = cardTemplate;
            
            // Handle specific image URL formatting
            if (member.Headshot && !member.Headshot.startsWith('http')) {
                member.Headshot = config.imageBaseUrl + member.Headshot;
            }

            // Replace all placeholders [KeyName] with actual data
            for (const key in member) {
                const regex = new RegExp(`\\[${key}\\]`, 'g');
                cardHtml = cardHtml.replace(regex, member[key] !== null ? member[key] : '');
            }
            cardsHtml += cardHtml;
        });

        // 5. Inject into Target Div
        targetDiv.innerHTML = wrapperStart + cardsHtml + wrapperEnd;

    } catch (error) {(async function() {
    const configNode = document.getElementById('team-index-config');
    if (!configNode) return;
    
    const config = JSON.parse(configNode.textContent);
    const targetDiv = document.getElementById(config.targetDivId);

    if (!targetDiv) return;

    try {
        // 1. Fetch JSON Data and HTML Template concurrently
        const [dataResponse, htmlResponse] = await Promise.all([
            fetch(config.jsonUrl),
            fetch(config.htmlUrl)
        ]);

        if (!dataResponse.ok || !htmlResponse.ok) throw new Error("Failed to fetch data or template.");

        let teamData = await dataResponse.json();
        const htmlTemplate = await htmlResponse.text();

        // 2. Apply Filters
        if (config.filterField) {
            const filters = new URLSearchParams(config.filterField);
            teamData = teamData.filter(member => {
                let isMatch = true;
                for (const [key, value] of filters.entries()) {
                    if (member[key] != value) {
                        isMatch = false;
                        break;
                    }
                }
                return isMatch;
            });
        }

        // 3. Extract the repeating part of the HTML template
        const repeatStart = '<!-- START_REPEAT -->';
        const repeatEnd = '<!-- END_REPEAT -->';
        const startIndex = htmlTemplate.indexOf(repeatStart) + repeatStart.length;
        const endIndex = htmlTemplate.indexOf(repeatEnd);
        
        const wrapperStart = htmlTemplate.substring(0, htmlTemplate.indexOf(repeatStart));
        const wrapperEnd = htmlTemplate.substring(endIndex + repeatEnd.length);
        const cardTemplate = htmlTemplate.substring(startIndex, endIndex);

        // 4. Populate Data
        let cardsHtml = '';
        teamData.forEach(member => {
            let cardHtml = cardTemplate;
            
            if (member.Headshot && !member.Headshot.startsWith('http')) {
                member.Headshot = config.imageBaseUrl + member.Headshot;
            }

            for (const key in member) {
                const regex = new RegExp(`\\[${key}\\]`, 'g');
                cardHtml = cardHtml.replace(regex, member[key] !== null ? member[key] : '');
            }
            cardsHtml += cardHtml;
        });

        // 5. Inject into Target Div
        targetDiv.innerHTML = wrapperStart + cardsHtml + wrapperEnd;

    } catch (error) {
        console.error("Error rendering Team Index:", error);
        targetDiv.innerHTML = "<p>Unable to load team members at this time.</p>";
    }
})();
        console.error("Error rendering Team Index:", error);
        targetDiv.innerHTML = "<p>Unable to load team members at this time.</p>";
    }
});
