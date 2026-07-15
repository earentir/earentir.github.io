const dateMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayofWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

document.addEventListener("DOMContentLoaded", function () {
	    initialize();
});


function initialize() {
	    const curDateTime = new Date();
	    const curDate = curDateTime.toISOString().split("T")[0];
	    const curTime = curDateTime.toTimeString().split(" ")[0];

	    document.getElementById("localdate").value = curDate;
	    document.getElementById("localtime").value = curTime;

	    populateSelectOptions();
	    calcUTC();
}

function populateSelectOptions() {
	    const curDateTime = new Date();
	    const selectoptions = [
		            `${dateMonths[curDateTime.getMonth()]} ${addLZ(curDateTime.getDate())}, ${curDateTime.getFullYear()} ${buildTHT(curDateTime)}`,
		            `${dayofWeek[curDateTime.getDay()]}, ${dateMonths[curDateTime.getMonth()]} ${addLZ(curDateTime.getDate())}, ${curDateTime.getFullYear()} ${buildTHT(curDateTime, false)}`,
		            `${addLZ(curDateTime.getDate())}/${addLZ(curDateTime.getMonth() + 1)}/${curDateTime.getFullYear()}`,
		            `${dateMonths[curDateTime.getMonth()]} ${addLZ(curDateTime.getDate())}, ${curDateTime.getFullYear()}`,
		            buildTHT(curDateTime, false),
		            buildTHT(curDateTime, true),
		            "in N days"
		        ];

	    const select = document.getElementById("outputFormat");
	    selectoptions.forEach((optionText, i) => {
		            const option = document.createElement('option');
		            option.value = i;
		            option.innerHTML = optionText;
		            select.append(option);
		        });
}


function buildTHT(datetime, seconds = true) {
	    const curTimeMinutes = datetime.toTimeString().split(" ")[0].split(":")[1];
	    let curTimeHours = datetime.toTimeString().split(" ")[0].split(":")[0];
	    const curTimeSeconds = datetime.toTimeString().split(" ")[0].split(":")[2];

	    const formattedTime = seconds ? `${curTimeMinutes}:${curTimeSeconds}` : curTimeMinutes;

	    if (curTimeHours > 12) {
		            curTimeHours -= 12;
		            return `${addLZ(curTimeHours)}:${formattedTime} PM`;
		        }

	    return `${addLZ(curTimeHours)}:${formattedTime} AM`;
}

function addLZ(digit) {
	    return digit.toString().padStart(2, '0');
}

function calcUTC() {
	    const dateValue = document.getElementById("localdate").value;
	    const timeValue = document.getElementById("localtime").value;

	    const preflightUTC = new Date(`${dateValue}T${timeValue}`);
	    const epoch = String(preflightUTC.valueOf()).substring(0, 10);
	    const discorttimeforms = ['f', 'F', 'd', 'D', 't', 'T', 'R'];

	    document.getElementById("discorttime").value = `<t:${epoch}:${discorttimeforms[document.getElementById("outputFormat").value]}>`;
}

