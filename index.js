const express = require("express");
const req = require("express/lib/request");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

// function to get authentication for accessing Google Sheets
async function getAuthSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets",
  });

  const client = await auth.getClient();

  const googleSheets = google.sheets({
    version: "v4",
    auth: client,
  });

  const spreadsheetID = "1VUHy0ihLsV0NpIrDgtOahLA3VU7jiG2ABQg9BiccKV0";

  return {
    auth,
    client,
    googleSheets,
    spreadsheetID,
  };
}

// Function to calculate student situation based on absences
async function calculateAbsenceSituation() {
  const { googleSheets, auth, spreadsheetID } = await getAuthSheets();

  const column = await googleSheets.spreadsheets.values.get({
    auth,
    spreadsheetId: spreadsheetID,
    range: "engenharia_de_software!C4:C4004",
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const absenceSituation = column.data.values.map((values) => {
    const situation =
      values >= 15 ? ["Reprovado por falta"] : ["Aprovado"];
    return situation;
  });

  return { absenceSituation };
}

// Function to calculate student situation based on average
async function calculateAverageSituation() {
  const { googleSheets, auth, spreadsheetID } = await getAuthSheets();

  const column = await googleSheets.spreadsheets.values.get({
    auth,
    spreadsheetId: spreadsheetID,
    range: "engenharia_de_software!D4:F27004",
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const averageSituation = column.data.values.map((values) => {
    const average = values.reduce((acc, curr) => acc + curr, 0) / 30;

    if (average < 5) {
      const notApprovedByNote = ["Reprovado por Nota"];
      return notApprovedByNote;
    } else if (average >= 5 && average < 7) {
      const finalExam = ["Exame Final"];
      return finalExam;
    } else {
      const Approved = ["Aprovado"];
      return Approved;
    }
  });

  return { averageSituation };
}

// Function to calculate grade for final aprproval
async function getFinalNote() {
  const { googleSheets, auth, spreadsheetID } = await getAuthSheets();

  const column = await googleSheets.spreadsheets.values.get({
    auth,
    spreadsheetId: spreadsheetID,
    range: "engenharia_de_software!D4:F27004",
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const finalGrade = column.data.values.map((values) => {
    const average = values.reduce((acc, curr) => acc + curr, 0) / 30;
    if (average >= 5 && average < 7) return [parseFloat((10 - average).toFixed(0))];
    else return [0];
  });

  return { finalGrade };
}

// Route to update columns with student situation 
app.get("/getStudentSituation", async (req, res) => {
  const { googleSheets, auth, spreadsheetID } = await getAuthSheets();

  // combining results of "Reprovado por falta" with averageSituation
  const { absenceSituation } = await calculateAbsenceSituation();
  const { averageSituation } = await calculateAverageSituation();

  const situationStudent = [];

  for (let i = 0; i < Math.max(absenceSituation.length, averageSituation.length); i++) {
    const absenceStatus = absenceSituation[i] ? absenceSituation[i][0] : null;
    const averageStatus = averageSituation[i] ? averageSituation[i][0] : null;
    // ajeitar no modo switch
    if (absenceStatus === "Reprovado por falta") {
      situationStudent.push(["Reprovado por falta"]);
    } else if (averageStatus === "Reprovado por Nota") {
      situationStudent.push(["Reprovado por Nota"]);
    } else if (averageStatus === "Exame Final") {
      situationStudent.push(["Exame Final"]);
    } else {
      situationStudent.push(["Aprovado"]);
    }
  }

  // Preparing data to update the column "Situação"
  const valuesToUpdate = situationStudent.map(([situation]) => [situation]);

  await googleSheets.spreadsheets.values.update({
    auth,
    spreadsheetId: spreadsheetID,
    range: "engenharia_de_software!G4:G27004",
    valueInputOption: "USER_ENTERED",
    resource: { values: valuesToUpdate },
  });

  const updatedColumnSituation = await googleSheets.spreadsheets.values.get({
    auth,
    spreadsheetId: spreadsheetID,
    range: "engenharia_de_software!G4:G27004",
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  // combining results of "Reprovado por falta" with grade for final approval (finalGrade)
  const finalGrade = await getFinalNote();

  const gradeFinalApprove = [];

  for (let i = 0; i < Math.max(absenceSituation.length, finalGrade.finalGrade.length); i++) {
    const absenceStatus = absenceSituation[i] ? absenceSituation[i][0] : null;
    const finalGradeStatus = finalGrade.finalGrade[i] ? finalGrade.finalGrade[i][0] : null;

    if (absenceStatus == "Reprovado por falta") {
      gradeFinalApprove.push([0]);
    } else 
    gradeFinalApprove.push([finalGradeStatus]);
  }

    // Preparing data to update the column "Nota para Aprovação Final"	
  const finalGradeColumn = gradeFinalApprove.map(([situation]) => [situation]);

  await googleSheets.spreadsheets.values.update({
    auth,
    spreadsheetId: spreadsheetID,
    range: "engenharia_de_software!H4:H27004",
    valueInputOption: "USER_ENTERED",
    resource: { values: finalGradeColumn },
  });

  const updatedFinalGradeColumn = await googleSheets.spreadsheets.values.get({
    auth,
    spreadsheetId: spreadsheetID,
    range: "engenharia_de_software!H4:H27004",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  
  res.send(updatedColumnSituation.data + updatedFinalGradeColumn.data);
});



app.listen(3001, () => console.log("listening on port 3001"));