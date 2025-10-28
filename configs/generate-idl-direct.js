const path = require("path");
const { execSync } = require("child_process");
const fs = require("fs");

const idlDir = path.join(__dirname, "..", "idls");
const binaryPath = path.join(__dirname, "..", ".crates", "bin", "shank");

// Configuration for all programs
const programs = [
  {
    programDir: path.join(__dirname, "..", "programs", "bgl-cartridge"),
    idlName: "bgl_cartridge_program",
    programName: "bgl_cartridge_program",
    programId: "CART9hmcuf38a58NCYhRJmtGXJjh16eXmLr9hmhAqPZo"
  },
  {
    programDir: path.join(__dirname, "..", "programs", "bgl-legit"),
    idlName: "bgl_legit_program",
    programName: "bgl_legit_program",
    programId: "11111111111111111111111111111111" // TODO: Update with actual program ID after deployment
  }
];

// Ensure IDL directory exists
if (!fs.existsSync(idlDir)) {
  fs.mkdirSync(idlDir, { recursive: true });
}

// Check if shank binary exists
if (!fs.existsSync(binaryPath)) {
  console.error(`Shank binary not found at ${binaryPath}`);
  console.error("Please run: cargo install shank-cli --root .crates");
  process.exit(1);
}

// Generate IDL for each program
for (const program of programs) {
  console.log(`\n=== Generating IDL for ${program.programName} ===`);

  // Remove existing IDL if it exists
  const idlPath = path.join(idlDir, `${program.programName}.json`);
  if (fs.existsSync(idlPath)) {
    fs.unlinkSync(idlPath);
    console.log(`Removed existing IDL at ${idlPath}`);
  }

  // Run shank to generate IDL
  const command = `${binaryPath} idl --out-dir ${idlDir} --crate-root ${program.programDir}`;
  console.log(`Running: ${command}`);

  try {
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: "pipe"
    });

    if (output) {
      console.log(output);
    }

    // Verify IDL was created
    if (fs.existsSync(idlPath)) {
      // Read and enhance the IDL with metadata
      const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

      // Add metadata
      idl.metadata = {
        ...idl.metadata,
        address: program.programId,
        origin: "shank",
      };

      // Write back the enhanced IDL
      fs.writeFileSync(idlPath, JSON.stringify(idl, null, 2));

      console.log(`✅ IDL generated successfully at ${idlPath}`);

      // Also create a copy with the alternate name if needed
      const altIdlPath = path.join(idlDir, `${program.idlName}.json`);
      if (altIdlPath !== idlPath) {
        fs.copyFileSync(idlPath, altIdlPath);
        console.log(`✅ IDL also copied to ${altIdlPath}`);
      }
    } else {
      console.error(`❌ IDL generation failed for ${program.programName} - file not created`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error generating IDL for ${program.programName}:`, error.message);
    if (error.stderr) {
      console.error("stderr:", error.stderr.toString());
    }
    process.exit(1);
  }
}

console.log("\n=== All IDLs generated successfully ===");