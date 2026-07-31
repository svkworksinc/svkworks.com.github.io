/* ============================================
   SVK Works — Interactive Wiring Diagram Data
   ============================================

   HOW THIS FILE IS ORGANISED
   --------------------------
   CIRCUIT_LIBRARY holds one entry per *kind* of circuit found in a standalone
   engine harness. The content there is general engineering truth — how a
   low-side injector driver works, what a VR crank signal looks like on a
   scope, what an NTC thermistor reads at 20 °C. That does not change between
   a 2JZ and a 1UZ, so it lives in one place.

   WIRING_PLATFORMS then describes a specific chassis + engine + ECU build:
   which nodes (connectors/devices) exist, and which circuits run between
   them. Platform-specific facts (this engine has VVT, that one doesn't;
   this ECU calls the pin A-12) are supplied per platform via `overrides`.

   ON PIN NUMBERS — READ THIS BEFORE EDITING
   -----------------------------------------
   Every platform carries a `verified` flag.

     verified: false  → pin assignments are shown as REFERENCE ONLY and the
                        UI displays a prominent warning. Use this until
                        someone at SVK Works has physically checked the
                        pinout against the actual ECU manual and a built
                        harness.
     verified: true   → someone has checked it. Set `verifiedBy` and
                        `verifiedDate` at the same time.

   ECU pin numbering differs between models within the same product family
   (a Link G4X Fury is not pinned like a G4X Storm), so a pin number that is
   right for one build can be wrong for the next. The `ecuPin` field is
   deliberately left null where it hasn't been confirmed; the UI renders
   "Not verified" rather than inventing a number. Do not fill these in with
   guesses — a wrong pin number here can destroy an ECU.
   ============================================ */

/* --------------------------------------------------------------------------
   Wire gauge reference — cross-sectional area to AWG, plus a conservative
   continuous current rating for a wire bundled inside a loom at engine-bay
   temperature. These are intentionally lower than free-air ratings.
   -------------------------------------------------------------------------- */
const WIRE_GAUGES = {
  '0.35mm': { awg: '22 AWG', amps: 3,  note: 'Low-current signals only' },
  '0.5mm':  { awg: '20 AWG', amps: 5,  note: 'Standard sensor / signal wire' },
  '0.75mm': { awg: '18 AWG', amps: 8,  note: 'Injector and coil drives' },
  '1.0mm':  { awg: '16 AWG', amps: 11, note: 'Small loads, relay coils' },
  '1.5mm':  { awg: '14 AWG', amps: 16, note: 'Fuel pump, fan feeds' },
  '2.0mm':  { awg: '12 AWG', amps: 22, note: 'Main power and ground runs' },
  '3.0mm':  { awg: '10 AWG', amps: 30, note: 'High-current distribution' },
};

/* --------------------------------------------------------------------------
   Circuit categories — drive colour coding, the legend, and filtering.
   -------------------------------------------------------------------------- */
const CIRCUIT_CATEGORIES = {
  power:    { label: 'Power',        color: '#ef4444', desc: 'Battery, switched and fused 12 V supplies' },
  ground:   { label: 'Ground',       color: '#9ca3af', desc: 'Chassis, power and clean sensor grounds' },
  sensor:   { label: 'Sensor Input', color: '#22c55e', desc: 'Analog and digital signals into the ECU' },
  injector: { label: 'Injection',    color: '#eab308', desc: 'Injector drive circuits' },
  ignition: { label: 'Ignition',     color: '#f97316', desc: 'Coil trigger and ignition control' },
  actuator: { label: 'Actuator',     color: '#a855f7', desc: 'ECU-driven solenoids, relays and valves' },
  comms:    { label: 'Comms',        color: '#3b82f6', desc: 'CAN bus and serial links' },
};

/* --------------------------------------------------------------------------
   CIRCUIT LIBRARY
   Generic, engineering-accurate descriptions of each circuit type.
   `testing` describes a measurement anyone can take with a basic multimeter.
   -------------------------------------------------------------------------- */
const CIRCUIT_LIBRARY = {

  /* ---- Power ---- */
  'ecu-main-power': {
    name: 'ECU Main Power (Switched 12 V)',
    category: 'power',
    gauge: '1.0mm',
    signalType: 'Switched battery voltage',
    normalRange: '13.8–14.4 V engine running, 12.4–12.7 V key-on engine-off',
    fn: 'Primary switched supply to the ECU, fed from the main relay output. The relay is held closed by the ECU itself so it can keep power after key-off long enough to write learned values and run down the internal supply cleanly. Feed this from its own fused output — never share it with an inductive load such as a fan or pump, whose collapse spikes couple straight into the ECU supply rail.',
    faults: [
      'No-start with no ECU comms and no dash lights from the ECU',
      'ECU resetting or losing sync during cranking — usually voltage sag from a shared or undersized feed',
      'Learned trims and fault codes lost at every key-off if the hold circuit fails',
    ],
    testing: 'Back-probe the ECU power pin with the key on. Expect battery voltage within 0.3 V of the battery terminal. Anything more than 0.5 V below battery is excessive drop — check the relay contacts and crimps. Repeat while cranking; if it dips below about 9 V the ECU may reset.',
    related: ['main-relay-control', 'ecu-power-ground', 'battery-feed'],
  },
  'battery-feed': {
    name: 'Permanent Battery Feed',
    category: 'power',
    gauge: '2.0mm',
    signalType: 'Unswitched battery voltage',
    normalRange: '12.4–12.7 V at rest',
    fn: 'Always-live supply taken from the battery or main distribution stud, feeding the main relay coil side and the ECU keep-alive memory. This is the one circuit in the harness that is live with the key out, so it must be fused as close to the source as physically possible — the fuse protects the wire, not the device.',
    faults: [
      'Flat battery overnight from an unfused or chafed permanent feed',
      'ECU loses all settings and relearns every start if keep-alive is missing',
    ],
    testing: 'Measure at the ECU end with everything off; should read battery voltage. To hunt a parasitic drain, put an ammeter in series at the battery negative and pull fuses one at a time.',
    related: ['ecu-main-power', 'main-relay-control'],
  },
  'injector-power-rail': {
    name: 'Injector / Coil +12 V Rail',
    category: 'power',
    gauge: '1.5mm',
    signalType: 'Switched battery voltage',
    normalRange: 'Battery voltage while the main relay is closed',
    fn: 'Common high-side supply shared by every injector and, on most builds, the ignition coils. Because all injectors are low-side driven, this rail is permanently live while the engine runs and the ECU switches only the ground side. Run it as a single heavy feed to a splice near the fuel rail rather than daisy-chaining injector to injector — a daisy chain puts the full bundle current through the first joint.',
    faults: [
      'Engine dies or misfires under load when the rail drops voltage',
      'A whole bank of injectors dead at once — almost always the shared rail, not six failed injectors',
    ],
    testing: 'Key-on, back-probe the +12 V side of any injector connector: battery voltage. Compare the first and last injector on the rail while running — more than about 0.3 V difference indicates undersized wire or a poor splice.',
    related: ['injector-drive', 'main-relay-control', 'ignition-coil-drive'],
  },

  /* ---- Ground ---- */
  'ecu-power-ground': {
    name: 'ECU Power Ground',
    category: 'ground',
    gauge: '2.0mm',
    signalType: 'Ground return',
    normalRange: '< 0.1 V drop to battery negative',
    fn: 'High-current return path for the ECU and its output drivers. Every ECU ground pin must land on the same single point — a star ground — and that point should go to the engine block or battery negative directly. Grounding one ECU pin to the chassis and another to the block creates a voltage offset between them that appears as noise on every sensor reading referenced to those grounds.',
    faults: [
      'Erratic sensor readings that move when electrical load changes',
      'Injectors or coils that misfire only when the fan or fuel pump switches on',
      'Communication dropouts on CAN, since CAN is referenced to ground',
    ],
    testing: 'Voltage-drop test is far more revealing than a resistance check. With the engine running and loads on, measure between the ECU ground pin and the battery negative post. Anything above 0.1 V means a poor ground. Resistance alone can read near zero and still fail under current.',
    related: ['sensor-ground', 'chassis-ground', 'ecu-main-power'],
  },
  'sensor-ground': {
    name: 'Sensor Ground (Clean Reference)',
    category: 'ground',
    gauge: '0.5mm',
    signalType: 'Reference ground',
    normalRange: '< 0.05 V offset from ECU ground',
    fn: 'Dedicated low-current ground reference for analog sensors, generated inside the ECU and deliberately kept separate from the power ground. A TPS or MAP output is only meaningful relative to this reference, so any current flowing in it shifts every analog reading at once. Never join sensor ground to chassis ground at the sensor end — that turns the sensor return into a parallel path for power ground current.',
    faults: [
      'All analog sensors reading slightly high or low together',
      'Throttle position drifting as engine load changes',
      'Wideband and MAP disagreeing with known-good gauges by a consistent offset',
    ],
    testing: 'Key-on, measure between sensor ground at the sensor connector and the ECU ground pin. Expect under 0.05 V. A larger offset means sensor ground has been tied into a current-carrying path somewhere.',
    related: ['ecu-power-ground', 'sensor-5v-ref', 'tps-signal'],
  },
  'chassis-ground': {
    name: 'Chassis / Engine Block Ground Strap',
    category: 'ground',
    gauge: '3.0mm',
    signalType: 'Ground return',
    normalRange: '< 0.1 V drop under starter load',
    fn: 'The bond between engine block, chassis and battery negative. On a swapped car this is the single most commonly under-specified circuit in the whole build: the engine sits on rubber mounts, so without a deliberate strap the only return path is through throttle cables and coolant hoses. Every starter amp will find that path and drop voltage across it.',
    faults: [
      'Slow cranking that improves when jumper cables are added to the block',
      'Tachometer and gauges jumping while cranking',
      'Corroded throttle cables or heater hoses that have been carrying current',
    ],
    testing: 'While cranking, measure between the engine block and the battery negative post. Above 0.2 V means the strap is inadequate or corroded. Do the same between chassis and battery negative.',
    related: ['ecu-power-ground', 'battery-feed'],
  },

  /* ---- Sensor inputs ---- */
  'sensor-5v-ref': {
    name: '5 V Sensor Reference Supply',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: 'Regulated DC supply',
    normalRange: '4.95–5.05 V',
    fn: 'Regulated 5 V rail generated inside the ECU to excite potentiometric and pressure sensors — TPS, MAP, oil and fuel pressure. It is current-limited and shared, so a single shorted sensor pulls the rail down and every sensor on it reads wrong simultaneously. That shared-failure behaviour is the fastest way to diagnose it.',
    faults: [
      'Multiple unrelated sensors faulting at the same instant',
      'TPS and MAP both reading zero or pegged',
      'A short to ground in one sensor taking down the whole rail',
    ],
    testing: 'Key-on, measure the 5 V pin at any sensor connector against sensor ground: 4.95–5.05 V. If low, unplug sensors one at a time — the rail recovering identifies the shorted device.',
    related: ['sensor-ground', 'tps-signal', 'map-signal'],
  },
  'crank-position': {
    name: 'Crank Position Sensor (CPS)',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: 'Variable reluctance (AC) or Hall (digital)',
    normalRange: 'VR: 0.5–2 V AC cranking, rising with rpm. Hall: 0–5 V square wave',
    fn: 'The primary engine speed and position reference. Everything the ECU does for spark and fuel timing is derived from this signal, which makes it the single most critical input in the harness. A variable-reluctance sensor generates its own AC voltage and must run as a twisted, shielded pair with the shield grounded at the ECU end only — grounding both ends creates a loop that injects noise directly into the timing reference.',
    faults: [
      'No spark and no injector pulse — the ECU never sees rotation, so it never starts',
      'Random misfires or cutouts at high rpm as noise swamps the signal',
      'Erratic or jumping tach readings',
    ],
    testing: 'For a VR sensor, measure resistance across the two pins with it unplugged — typically several hundred ohms to about 1.5 kΩ; open or shorted is a failed sensor. Then set a meter to AC volts and crank: you should see an AC voltage appear. For a Hall sensor, confirm supply and ground first, then look for a switching output.',
    related: ['cam-position', 'sensor-ground', 'ecu-power-ground'],
  },
  'cam-position': {
    name: 'Cam Position Sensor',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: 'Variable reluctance or Hall',
    normalRange: 'One pulse per camshaft revolution (every two crank revolutions)',
    fn: 'Identifies which stroke the engine is on so the ECU can tell compression from exhaust. Required for sequential injection and coil-per-cylinder ignition; without it the ECU can only run wasted spark and batch fuel. Uses the same shielding discipline as the crank sensor.',
    faults: [
      'Engine starts but only in batch-fire and wasted-spark mode',
      'Extended cranking while the ECU waits for cam sync',
      'Sync loss faults logged at higher rpm',
    ],
    testing: 'Same procedure as the crank sensor. Confirm sync on a laptop while cranking — the ECU should report a stable cam sync rather than intermittent capture.',
    related: ['crank-position', 'vvt-solenoid', 'sensor-ground'],
  },
  'tps-signal': {
    name: 'Throttle Position Sensor (TPS)',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: '0–5 V analog (potentiometer wiper)',
    normalRange: '≈0.5 V closed throttle, ≈4.5 V wide open',
    fn: 'A potentiometer across the 5 V reference whose wiper voltage tracks throttle plate angle. The ECU uses it for load estimation on alpha-N tunes, acceleration enrichment, idle recognition and overrun fuel cut. The absolute voltages matter less than smooth continuity — a dead spot in the track causes a stumble at exactly the same throttle position every time.',
    faults: [
      'Hesitation or stumble at one repeatable throttle position',
      'Erratic idle or the ECU never recognising closed throttle',
      'No acceleration enrichment, causing a lean bog on tip-in',
    ],
    testing: 'Back-probe the signal wire with the key on and sweep the throttle slowly by hand while watching a meter. The voltage must rise smoothly with no jumps or dropouts. Confirm it does not hit 0 V or 5 V at either stop, which would indicate a miscalibrated or wrongly-clocked sensor.',
    related: ['sensor-5v-ref', 'sensor-ground', 'map-signal', 'idle-control'],
  },
  'map-signal': {
    name: 'MAP Sensor (Manifold Pressure)',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: '0–5 V analog',
    normalRange: '≈1.5–2.0 V at idle vacuum, rising with boost',
    fn: 'Measures absolute pressure in the intake manifold and forms the load axis of a speed-density fuel table. On a boosted build the sensor range must exceed the target — a 2.5 bar sensor saturates around 22 psi and the ECU then has no idea how much more boost is present, which is a genuinely dangerous failure mode because fuelling stops increasing while airflow keeps climbing.',
    faults: [
      'Fuelling that goes lean above a specific boost pressure — the sensor has saturated',
      'Rich or lean across the whole map from a vacuum leak at the sensor hose',
      'Unstable idle from a cracked or water-filled reference line',
    ],
    testing: 'Key-on engine-off the sensor reads atmospheric pressure — roughly 4.5 V on a 1 bar sensor at sea level. Apply vacuum with a hand pump and confirm the voltage falls smoothly and returns.',
    related: ['sensor-5v-ref', 'sensor-ground', 'iat-signal', 'boost-control'],
  },
  'iat-signal': {
    name: 'Intake Air Temperature (IAT)',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: 'NTC thermistor, ECU pull-up',
    normalRange: '≈2.5 V at 20 °C, falling as temperature rises',
    fn: 'A negative-temperature-coefficient thermistor whose resistance falls as it heats. The ECU supplies a fixed pull-up and reads the resulting divider voltage, so only two wires are needed. Air temperature feeds the air-density correction and, on most ECUs, an ignition-timing retard as intake temperatures climb — which is what protects a turbo engine from detonation on a heat-soaked track day.',
    faults: [
      'Rich or lean warm-up if the sensor reads permanently cold',
      'Loss of the intake-temperature timing retard, raising detonation risk under boost',
      'Sensor reading exactly -40 °C or maximum scale, which indicates open or shorted wiring rather than a real temperature',
    ],
    testing: 'Unplug and measure resistance across the sensor: roughly 2–3 kΩ at 20 °C for a common Bosch-style NTC, falling to a few hundred ohms when hot. Shorting the two harness pins together should make the ECU read maximum temperature — a quick way to prove the wiring independently of the sensor.',
    related: ['clt-signal', 'sensor-ground', 'map-signal'],
  },
  'clt-signal': {
    name: 'Coolant Temperature (CLT)',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: 'NTC thermistor, ECU pull-up',
    normalRange: '≈2.5 V at 20 °C, ≈0.5 V at operating temperature',
    fn: 'Electrically identical to the IAT sensor but thermally coupled to the coolant. Drives cold-start enrichment, warm-up idle-up, fan control and closed-loop enable. It is the sensor most likely to be blamed for a hard cold start, because a coolant sensor reading warm when the engine is actually cold removes the enrichment the engine needs.',
    faults: [
      'Hard starting when cold, with no enrichment applied',
      'Fans never switching on, or running constantly from key-on',
      'Closed-loop fuel control never enabling',
    ],
    testing: 'Same resistance check as IAT. Compare the ECU-reported coolant temperature against an infrared thermometer on the thermostat housing after warm-up — they should agree within a few degrees.',
    related: ['iat-signal', 'sensor-ground', 'fan-control'],
  },
  'wideband-o2': {
    name: 'Wideband O₂ (Lambda) Input',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: '0–5 V analog from the controller, or CAN',
    normalRange: 'Controller-specific — commonly 0–5 V mapped to λ 0.68–1.36',
    fn: 'Analog output from a wideband lambda controller, giving the ECU a true air-fuel ratio rather than the narrowband switch that OEM sensors provide. The scaling in the ECU must match the controller exactly; a mismatched calibration table produces an AFR display that looks plausible but is wrong, which is worse than no gauge at all. Prefer the CAN connection where both devices support it, since it avoids analog scaling error entirely.',
    faults: [
      'Displayed AFR that does not match the controller\'s own gauge — a scaling mismatch',
      'Closed-loop correction driving the mixture the wrong way',
      'Slow or dead response from a sensor past its service life',
    ],
    testing: 'Compare the ECU-reported lambda against the controller\'s own display at several steady loads. They must agree. If they do not, the ECU input scaling is wrong, not the sensor. Verify the controller and ECU share a ground reference.',
    related: ['sensor-ground', 'can-bus', 'ecu-power-ground'],
  },
  'knock-sensor': {
    name: 'Knock Sensor',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: 'Piezoelectric AC, shielded',
    normalRange: 'Small AC millivolt signal, frequency set by bore diameter',
    fn: 'A piezoelectric accelerometer bolted to the block that listens for the characteristic ringing of detonation. The signal is tiny and lives in a violently noisy environment, so it must be run as shielded cable with the shield grounded only at the ECU. Sensor torque matters more than most people expect — a loose knock sensor cannot transmit block vibration and will simply never detect knock.',
    faults: [
      'Knock never detected, removing the engine\'s last line of defence under boost',
      'False knock retard from an over-torqued or wrongly-located sensor, costing power',
      'Noise pickup from unshielded routing near ignition leads',
    ],
    testing: 'Measure resistance across the sensor — usually very high, effectively open, for a resonant type. With the engine idling and knock logging active, gently tap the block near the sensor with a spanner; the ECU should register knock activity.',
    related: ['ecu-power-ground', 'ignition-coil-drive', 'iat-signal'],
  },
  'oil-pressure': {
    name: 'Oil Pressure Sensor',
    category: 'sensor',
    gauge: '0.5mm',
    signalType: '0–5 V analog, or switch',
    normalRange: '≈0.5 V at 0 psi, rising linearly to sensor maximum',
    fn: 'Feeds oil pressure to the ECU so a protection strategy can cut power or trigger a warning before bearing damage occurs. On any engine making meaningful power this should be wired to a real analog sensor rather than the OEM idiot-light switch, because a switch only tells you the pressure has already collapsed.',
    faults: [
      'Protection strategy either never triggering or nuisance-tripping at idle',
      'Reading pinned at maximum or zero, indicating open or shorted wiring',
    ],
    testing: 'Key-on engine-off should show approximately zero pressure. Compare the ECU reading against a mechanical gauge teed into the same port at idle and at speed.',
    related: ['sensor-5v-ref', 'sensor-ground'],
  },

  /* ---- Injection ---- */
  'injector-drive': {
    name: 'Injector Drive (Low-Side)',
    category: 'injector',
    gauge: '0.75mm',
    signalType: 'Switched ground, PWM',
    normalRange: 'Battery voltage at rest, pulled near 0 V during injection',
    fn: 'The ECU switches the ground side of the injector while the +12 V rail stays live. The wire therefore sits at battery voltage when the injector is closed and is pulled to near ground for the duration of the pulse. Collapsing the injector solenoid field produces a substantial inductive spike, which the ECU driver clamps internally — this is why injectors must be driven by a proper driver output and never by a generic relay output. High-impedance injectors are driven saturated; low-impedance injectors need peak-and-hold or an external resistor pack, and getting this wrong will cook either the injector or the driver.',
    faults: [
      'One dead cylinder with good spark and compression — usually the drive wire or driver',
      'Injector stuck open, flooding a cylinder, if the drive wire shorts to ground',
      'Damaged ECU driver from wiring a low-impedance injector to a saturated output',
    ],
    testing: 'A noid light in place of the injector connector flashes while cranking if the drive is working. Measure injector resistance at the connector: roughly 12–16 Ω for high impedance, 2–5 Ω for low impedance. Compare all cylinders — an outlier identifies the failed injector.',
    related: ['injector-power-rail', 'ecu-power-ground', 'crank-position'],
  },

  /* ---- Ignition ---- */
  'ignition-coil-drive': {
    name: 'Ignition Coil Trigger',
    category: 'ignition',
    gauge: '0.75mm',
    signalType: '0–5 V or 0–12 V logic pulse',
    normalRange: 'Logic-level pulse; dwell period set by the ECU',
    fn: 'Trigger signal to a coil-on-plug igniter or external ignition module. Where the coil contains its own igniter the ECU supplies only a low-current logic pulse; where it does not, an external ignitor must be fitted, because switching a coil primary directly from an ECU output will destroy the output. Dwell time is configured in the ECU and controls how long the primary charges — too long overheats the coil, too short gives weak spark under boost.',
    faults: [
      'Misfire on one cylinder with a healthy injector — trigger wire or coil',
      'Coils overheating and failing from excessive configured dwell',
      'Destroyed ECU output from driving a coil primary without an igniter',
    ],
    testing: 'Confirm the coil has +12 V and ground. Swap a suspect coil with a known-good one and see whether the misfire follows the coil — if it stays with the cylinder, the fault is in the wiring or the driver. Never crank with a coil primary disconnected and the output live.',
    related: ['injector-power-rail', 'crank-position', 'knock-sensor'],
  },

  /* ---- Actuators ---- */
  'main-relay-control': {
    name: 'Main Relay Control',
    category: 'actuator',
    gauge: '0.5mm',
    signalType: 'Switched ground (relay coil low side)',
    normalRange: '≈0 V when energised, battery voltage when open',
    fn: 'The ECU grounds the main relay coil to power itself and the rest of the system, then holds it closed briefly after key-off to complete its shutdown routine. Because the coil is inductive, a flyback diode across it is required — without one, the collapse spike appears across the ECU output every single time the relay opens, which is a slow way to kill an ECU.',
    faults: [
      'Complete no-start with nothing powered up',
      'ECU losing learned values because the hold-on period never happens',
      'Progressive ECU output damage from a missing flyback diode',
    ],
    testing: 'Key-on, back-probe the relay control wire: it should pull to near ground when the ECU energises the relay. Listen for the click. If the ECU has power but the relay never closes, check the coil and the diode before suspecting the ECU.',
    related: ['ecu-main-power', 'fuel-pump-relay', 'battery-feed'],
  },
  'fuel-pump-relay': {
    name: 'Fuel Pump Relay Control',
    category: 'actuator',
    gauge: '0.5mm',
    signalType: 'Switched ground (relay coil low side)',
    normalRange: '≈0 V when energised',
    fn: 'The ECU grounds the fuel pump relay coil, priming for a couple of seconds at key-on and then running the pump only while it sees engine rotation. That rotation check is a safety feature, not a convenience: in a crash the engine stops, the ECU drops the pump, and fuel stops being pumped onto the road. Never bypass it with a permanent live feed.',
    faults: [
      'No prime at key-on and no start',
      'Pump running with the engine stopped if the relay contacts weld or the circuit is bypassed',
      'Pump cutting out under load from an undersized relay or feed wire',
    ],
    testing: 'Key-on and listen for a two-second prime. Back-probe the relay control wire for a pull to ground. Check voltage at the pump itself while running — significant drop from battery indicates undersized supply wiring, a very common cause of high-rpm lean-out.',
    related: ['main-relay-control', 'injector-power-rail', 'crank-position'],
  },
  'idle-control': {
    name: 'Idle Air Control Valve',
    category: 'actuator',
    gauge: '0.75mm',
    signalType: 'PWM or stepper drive',
    normalRange: 'Duty cycle varying with target idle error',
    fn: 'Meters air around the closed throttle plate to hold target idle as load and temperature change. Two-wire and three-wire solenoid valves are PWM-driven, while stepper valves need four wires driven in the correct phase order — swapping a stepper pair makes the valve move the wrong way and the idle diverge instead of converge, which looks exactly like a tuning problem but is a wiring fault.',
    faults: [
      'Idle hunting or hanging high after throttle lift',
      'Stalling as the air conditioning or power steering loads the engine',
      'A stepper valve driving fully open or closed because two phases are swapped',
    ],
    testing: 'For a PWM valve, confirm 12 V on the supply side and look for a varying duty cycle on the drive. For a stepper, measure resistance across each coil pair to confirm the pairing before wiring, and watch the valve step through its range at key-on.',
    related: ['tps-signal', 'clt-signal', 'main-relay-control'],
  },
  'boost-control': {
    name: 'Boost Control Solenoid',
    category: 'actuator',
    gauge: '0.75mm',
    signalType: 'PWM switched ground',
    normalRange: '0–100 % duty at a solenoid-specific frequency, commonly 20–30 Hz',
    fn: 'Bleeds pressure from the wastegate actuator signal line so the ECU can hold boost above the gate\'s spring pressure. The plumbing orientation matters as much as the wiring — a solenoid piped backwards will still be electrically perfect while doing nothing useful. Like every solenoid, it needs flyback protection on its drive.',
    faults: [
      'Boost stuck at wastegate spring pressure — solenoid not actuating or piped wrong',
      'Boost spiking or creeping under load',
      'Overboost fuel cut from an inverted duty cycle',
    ],
    testing: 'Apply 12 V briefly across the solenoid and listen for a click. With the engine running, confirm the ECU commands a duty cycle above spring pressure and that measured boost responds to a duty change.',
    related: ['map-signal', 'injector-power-rail', 'knock-sensor'],
  },
  'vvt-solenoid': {
    name: 'VVT / Cam Control Solenoid',
    category: 'actuator',
    gauge: '0.75mm',
    signalType: 'PWM switched ground',
    normalRange: 'Duty cycle varying with commanded cam advance',
    fn: 'Controls oil flow to the cam phaser so the ECU can advance or retard valve timing on the fly. It is closed-loop against the cam position sensor, so both the solenoid drive and the cam signal must be healthy for it to work at all. Because it is hydraulic, it is also sensitive to oil temperature and pressure — cold or dirty oil produces sluggish response that looks electrical but is not.',
    faults: [
      'Cam timing never moving from its default position, losing mid-range torque',
      'Cam position error faults when commanded and actual angle disagree',
      'Oscillating cam angle from a control loop fighting a sticking phaser',
    ],
    testing: 'Confirm the solenoid clicks on 12 V. With the engine at operating temperature, command a cam angle change and confirm the measured angle follows. If not, verify the cam sensor before suspecting the solenoid.',
    related: ['cam-position', 'oil-pressure', 'clt-signal'],
  },
  'fan-control': {
    name: 'Cooling Fan Relay Control',
    category: 'actuator',
    gauge: '0.5mm',
    signalType: 'Switched ground (relay coil low side)',
    normalRange: '≈0 V when the fan is commanded on',
    fn: 'The ECU grounds a relay coil to run the cooling fans against a coolant temperature threshold with hysteresis, so the fan does not chatter around the switch point. Fan motors are among the most electrically hostile loads in the car — high inrush at startup and a large inductive spike at shutdown — so they need a properly rated relay, a fused feed sized for locked-rotor current, and a flyback diode on the coil.',
    faults: [
      'Overheating in traffic because the fan never switches on',
      'Fan running constantly from key-on, indicating an inverted output or stuck relay',
      'Voltage spikes upsetting other systems each time the fan cycles',
    ],
    testing: 'Raise the ECU coolant threshold temporarily, or heat the engine, and confirm the fan starts at the configured temperature and stops with hysteresis. Measure voltage at the fan motor while running — significant drop means the feed wire or relay is undersized.',
    related: ['clt-signal', 'main-relay-control', 'chassis-ground'],
  },

  /* ---- Comms ---- */
  'can-bus': {
    name: 'CAN Bus (High / Low)',
    category: 'comms',
    gauge: '0.35mm',
    signalType: 'Differential pair, commonly 500 kbit/s',
    normalRange: 'CAN-H ≈2.5–3.5 V, CAN-L ≈1.5–2.5 V, ≈60 Ω across the pair',
    fn: 'Twisted differential pair linking the ECU to dashes, loggers, power distribution modules and wideband controllers. Noise immunity comes entirely from the twist — the two wires pick up identical interference and the receiver subtracts it — so the pair must stay twisted for the whole run and must never be split around an obstacle. The bus needs exactly two 120 Ω terminating resistors, one at each physical end, which measure as 60 Ω in parallel across a powered-down bus.',
    faults: [
      'Complete loss of dash or logger data',
      'Intermittent dropouts under electrical load from a split or untwisted run',
      'Bus errors from missing, doubled or wrongly-placed termination',
    ],
    testing: 'With the ignition off, measure resistance between CAN-H and CAN-L: 60 Ω indicates correct termination at both ends, 120 Ω means one terminator is missing, and 40 Ω means a third has been added. Key-on, both lines should sit around 2.5 V at rest.',
    related: ['wideband-o2', 'ecu-power-ground', 'ecu-main-power'],
  },
  'tacho-output': {
    name: 'Tachometer Output',
    category: 'comms',
    gauge: '0.5mm',
    signalType: 'Square wave or open-collector pulse',
    normalRange: 'Frequency proportional to rpm, pulses per revolution set in the ECU',
    fn: 'Drives an analog dash tachometer from the ECU. Many OEM clusters expect a coil-style pulse rather than a clean logic square wave, and some need a pull-up resistor to 12 V to swing high enough to be recognised. If the needle reads exactly half or double the true rpm, the pulses-per-revolution setting is wrong — not the wiring.',
    faults: [
      'Tachometer reading half or double actual rpm — a pulses-per-rev configuration error',
      'Needle dead or twitching if the cluster needs a pull-up that is not fitted',
    ],
    testing: 'Compare the dash reading against the ECU\'s own rpm at a steady idle. If it is a consistent multiple, correct the pulses-per-revolution setting. If the needle is dead, try a 1 kΩ pull-up to 12 V on the signal line.',
    related: ['crank-position', 'can-bus'],
  },
};

/* --------------------------------------------------------------------------
   PLATFORMS
   Each platform lists the nodes present and which library circuits run
   between them. `overrides` supplies platform-specific text or pin data.
   -------------------------------------------------------------------------- */
const WIRING_PLATFORMS = {

  'mk4-supra-2jz-gte': {
    label: 'MK4 Supra',
    chassis: 'Toyota Supra JZA80 (1993–1998)',
    engine: '2JZ-GTE',
    ecu: 'Standalone (Link / Haltech / MaxxECU)',
    blurb: 'Standalone engine-management harness layout for a 2JZ-GTE in a JZA80. Sequential injection, coil-per-cylinder ignition and VVT-i cam control on the later variant.',
    verified: false,
    productUrl: 'mk4-supra.html',
    pdfUrl: 'wiring-diagram-mk4-supra.html',
    nodes: [
      { id: 'battery',   label: 'Battery / Fuse Box', side: 'left',  kind: 'power' },
      { id: 'sensors',   label: 'Engine Sensors',     side: 'left',  kind: 'sensor' },
      { id: 'trigger',   label: 'Crank / Cam Trigger', side: 'left', kind: 'sensor' },
      { id: 'ecu',       label: 'ECU',                side: 'center', kind: 'ecu' },
      { id: 'injectors', label: 'Injectors & Coils',  side: 'right', kind: 'injector' },
      { id: 'actuators', label: 'Solenoids & Relays', side: 'right', kind: 'actuator' },
      { id: 'cabin',     label: 'Cabin Bulkhead',     side: 'right', kind: 'comms' },
    ],
    circuits: [
      { id: 'battery-feed',        from: 'battery',   to: 'ecu' },
      { id: 'ecu-main-power',      from: 'battery',   to: 'ecu' },
      { id: 'ecu-power-ground',    from: 'ecu',       to: 'battery' },
      { id: 'chassis-ground',      from: 'battery',   to: 'ecu' },
      { id: 'sensor-ground',       from: 'ecu',       to: 'sensors' },
      { id: 'sensor-5v-ref',       from: 'ecu',       to: 'sensors' },
      { id: 'crank-position',      from: 'trigger',   to: 'ecu' },
      { id: 'cam-position',        from: 'trigger',   to: 'ecu' },
      { id: 'tps-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'map-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'iat-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'clt-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'knock-sensor',        from: 'sensors',   to: 'ecu' },
      { id: 'oil-pressure',        from: 'sensors',   to: 'ecu' },
      { id: 'injector-power-rail', from: 'battery',   to: 'injectors' },
      { id: 'injector-drive',      from: 'ecu',       to: 'injectors' },
      { id: 'ignition-coil-drive', from: 'ecu',       to: 'injectors' },
      { id: 'main-relay-control',  from: 'ecu',       to: 'actuators' },
      { id: 'fuel-pump-relay',     from: 'ecu',       to: 'actuators' },
      { id: 'idle-control',        from: 'ecu',       to: 'actuators' },
      { id: 'boost-control',       from: 'ecu',       to: 'actuators' },
      { id: 'vvt-solenoid',        from: 'ecu',       to: 'actuators' },
      { id: 'fan-control',         from: 'ecu',       to: 'actuators' },
      { id: 'can-bus',             from: 'ecu',       to: 'cabin' },
      { id: 'wideband-o2',         from: 'cabin',     to: 'ecu' },
      { id: 'tacho-output',        from: 'ecu',       to: 'cabin' },
    ],
    overrides: {
      'crank-position': {
        fn: 'On the 2JZ-GTE the crank sensor is a variable-reluctance pickup reading a toothed wheel behind the crank pulley. Run it as a twisted shielded pair with the shield grounded at the ECU end only. Non-VVT-i engines take cam sync from the distributor-mounted sensor, while VVT-i engines use a separate cam sensor — confirm which arrangement your engine has before wiring, since the two are not interchangeable.',
      },
      'vvt-solenoid': {
        fn: 'Fitted to VVT-i 2JZ-GTE engines only, controlling intake cam phasing hydraulically. Early non-VVT-i 2JZ-GTE engines have no phaser and this circuit is simply omitted from the harness — check the front of the intake cam for the phaser before allowing for it.',
      },
    },
  },

  'mk3-supra-7m-gte': {
    label: 'MK3 Supra',
    chassis: 'Toyota Supra MA70 (1986–1992)',
    engine: '7M-GTE',
    ecu: 'Standalone (Haltech / Link)',
    blurb: 'Standalone conversion layout for a 7M-GTE MA70. No variable cam timing, and the distributor supplies the primary engine position reference on most builds.',
    verified: false,
    productUrl: 'mk3-supra.html',
    pdfUrl: 'wiring-diagram-mk3-supra.html',
    nodes: [
      { id: 'battery',   label: 'Battery / Fuse Box', side: 'left',  kind: 'power' },
      { id: 'sensors',   label: 'Engine Sensors',     side: 'left',  kind: 'sensor' },
      { id: 'trigger',   label: 'Distributor / Trigger', side: 'left', kind: 'sensor' },
      { id: 'ecu',       label: 'ECU',                side: 'center', kind: 'ecu' },
      { id: 'injectors', label: 'Injectors & Coil',   side: 'right', kind: 'injector' },
      { id: 'actuators', label: 'Solenoids & Relays', side: 'right', kind: 'actuator' },
      { id: 'cabin',     label: 'Cabin Bulkhead',     side: 'right', kind: 'comms' },
    ],
    circuits: [
      { id: 'battery-feed',        from: 'battery',   to: 'ecu' },
      { id: 'ecu-main-power',      from: 'battery',   to: 'ecu' },
      { id: 'ecu-power-ground',    from: 'ecu',       to: 'battery' },
      { id: 'chassis-ground',      from: 'battery',   to: 'ecu' },
      { id: 'sensor-ground',       from: 'ecu',       to: 'sensors' },
      { id: 'sensor-5v-ref',       from: 'ecu',       to: 'sensors' },
      { id: 'crank-position',      from: 'trigger',   to: 'ecu' },
      { id: 'tps-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'map-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'iat-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'clt-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'knock-sensor',        from: 'sensors',   to: 'ecu' },
      { id: 'injector-power-rail', from: 'battery',   to: 'injectors' },
      { id: 'injector-drive',      from: 'ecu',       to: 'injectors' },
      { id: 'ignition-coil-drive', from: 'ecu',       to: 'injectors' },
      { id: 'main-relay-control',  from: 'ecu',       to: 'actuators' },
      { id: 'fuel-pump-relay',     from: 'ecu',       to: 'actuators' },
      { id: 'idle-control',        from: 'ecu',       to: 'actuators' },
      { id: 'boost-control',       from: 'ecu',       to: 'actuators' },
      { id: 'fan-control',         from: 'ecu',       to: 'actuators' },
      { id: 'can-bus',             from: 'ecu',       to: 'cabin' },
      { id: 'wideband-o2',         from: 'cabin',     to: 'ecu' },
      { id: 'tacho-output',        from: 'ecu',       to: 'cabin' },
    ],
    overrides: {
      'crank-position': {
        name: 'Distributor Position Signal',
        fn: 'The 7M-GTE takes its engine position reference from pickups inside the distributor rather than a crank-mounted trigger wheel. This gives adequate resolution for a stock rebuild but is noticeably less precise at high rpm than a crank trigger, and the timing reference moves with any play in the distributor drive. Many standalone conversions fit a crank trigger kit for exactly this reason.',
      },
      'ignition-coil-drive': {
        fn: 'Most 7M-GTE conversions retain a single coil fired through the distributor, so the ECU drives one ignition output into the factory igniter rather than a coil per cylinder. Do not drive the coil primary directly from the ECU — the igniter must remain in circuit.',
      },
    },
  },

  'sc300-sc400-1uz': {
    label: 'SC300 / SC400',
    chassis: 'Lexus SC300 / SC400 / Soarer Z30',
    engine: '2JZ-GE / 1UZ-FE',
    ecu: 'Standalone (Link / Haltech / MaxxECU)',
    blurb: 'Z30 chassis standalone layout. The 1UZ-FE V8 runs eight injectors and eight coils, so the injector and ignition sections carry roughly twice the circuit count of an inline six.',
    verified: false,
    productUrl: 'sc300.html',
    pdfUrl: 'wiring-diagram-sc300-sc400.html',
    nodes: [
      { id: 'battery',   label: 'Battery / Fuse Box', side: 'left',  kind: 'power' },
      { id: 'sensors',   label: 'Engine Sensors',     side: 'left',  kind: 'sensor' },
      { id: 'trigger',   label: 'Crank / Cam Trigger', side: 'left', kind: 'sensor' },
      { id: 'ecu',       label: 'ECU',                side: 'center', kind: 'ecu' },
      { id: 'injectors', label: 'Injectors & Coils',  side: 'right', kind: 'injector' },
      { id: 'actuators', label: 'Solenoids & Relays', side: 'right', kind: 'actuator' },
      { id: 'cabin',     label: 'Cabin Bulkhead',     side: 'right', kind: 'comms' },
    ],
    circuits: [
      { id: 'battery-feed',        from: 'battery',   to: 'ecu' },
      { id: 'ecu-main-power',      from: 'battery',   to: 'ecu' },
      { id: 'ecu-power-ground',    from: 'ecu',       to: 'battery' },
      { id: 'chassis-ground',      from: 'battery',   to: 'ecu' },
      { id: 'sensor-ground',       from: 'ecu',       to: 'sensors' },
      { id: 'sensor-5v-ref',       from: 'ecu',       to: 'sensors' },
      { id: 'crank-position',      from: 'trigger',   to: 'ecu' },
      { id: 'cam-position',        from: 'trigger',   to: 'ecu' },
      { id: 'tps-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'map-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'iat-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'clt-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'knock-sensor',        from: 'sensors',   to: 'ecu' },
      { id: 'oil-pressure',        from: 'sensors',   to: 'ecu' },
      { id: 'injector-power-rail', from: 'battery',   to: 'injectors' },
      { id: 'injector-drive',      from: 'ecu',       to: 'injectors' },
      { id: 'ignition-coil-drive', from: 'ecu',       to: 'injectors' },
      { id: 'main-relay-control',  from: 'ecu',       to: 'actuators' },
      { id: 'fuel-pump-relay',     from: 'ecu',       to: 'actuators' },
      { id: 'idle-control',        from: 'ecu',       to: 'actuators' },
      { id: 'fan-control',         from: 'ecu',       to: 'actuators' },
      { id: 'can-bus',             from: 'ecu',       to: 'cabin' },
      { id: 'wideband-o2',         from: 'cabin',     to: 'ecu' },
      { id: 'tacho-output',        from: 'ecu',       to: 'cabin' },
    ],
    overrides: {
      'injector-drive': {
        fn: 'The 1UZ-FE runs eight injectors in two banks of four. Sequential injection needs eight independent ECU driver outputs, which some entry-level ECUs cannot supply — check the driver count before committing to a sequential layout, since falling back to semi-sequential pairs the injectors and costs part-throttle resolution.',
      },
      'knock-sensor': {
        fn: 'The 1UZ-FE carries two knock sensors, one per bank, in the valley between the cylinder banks. Both must be wired as individually shielded runs with the shields grounded only at the ECU, and the ECU must be configured for two sensors so it can attribute knock to the correct bank.',
      },
    },
  },

  'k-series-universal': {
    label: 'K-Series',
    chassis: 'Universal K-swap (Civic, Integra, S2000, MR-S)',
    engine: 'K20 / K24',
    ecu: 'Standalone (Link / Haltech / KTuner)',
    blurb: 'Universal K-series swap layout. Coil-on-plug ignition, drive-by-wire throttle on later variants, and VTC cam phasing on the intake cam.',
    verified: false,
    productUrl: 'k-series-universal-harness.html',
    pdfUrl: 'resources.html',
    nodes: [
      { id: 'battery',   label: 'Battery / Fuse Box', side: 'left',  kind: 'power' },
      { id: 'sensors',   label: 'Engine Sensors',     side: 'left',  kind: 'sensor' },
      { id: 'trigger',   label: 'Crank / Cam Trigger', side: 'left', kind: 'sensor' },
      { id: 'ecu',       label: 'ECU',                side: 'center', kind: 'ecu' },
      { id: 'injectors', label: 'Injectors & Coils',  side: 'right', kind: 'injector' },
      { id: 'actuators', label: 'Solenoids & Relays', side: 'right', kind: 'actuator' },
      { id: 'cabin',     label: 'Cabin Bulkhead',     side: 'right', kind: 'comms' },
    ],
    circuits: [
      { id: 'battery-feed',        from: 'battery',   to: 'ecu' },
      { id: 'ecu-main-power',      from: 'battery',   to: 'ecu' },
      { id: 'ecu-power-ground',    from: 'ecu',       to: 'battery' },
      { id: 'chassis-ground',      from: 'battery',   to: 'ecu' },
      { id: 'sensor-ground',       from: 'ecu',       to: 'sensors' },
      { id: 'sensor-5v-ref',       from: 'ecu',       to: 'sensors' },
      { id: 'crank-position',      from: 'trigger',   to: 'ecu' },
      { id: 'cam-position',        from: 'trigger',   to: 'ecu' },
      { id: 'tps-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'map-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'iat-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'clt-signal',          from: 'sensors',   to: 'ecu' },
      { id: 'knock-sensor',        from: 'sensors',   to: 'ecu' },
      { id: 'oil-pressure',        from: 'sensors',   to: 'ecu' },
      { id: 'injector-power-rail', from: 'battery',   to: 'injectors' },
      { id: 'injector-drive',      from: 'ecu',       to: 'injectors' },
      { id: 'ignition-coil-drive', from: 'ecu',       to: 'injectors' },
      { id: 'main-relay-control',  from: 'ecu',       to: 'actuators' },
      { id: 'fuel-pump-relay',     from: 'ecu',       to: 'actuators' },
      { id: 'idle-control',        from: 'ecu',       to: 'actuators' },
      { id: 'vvt-solenoid',        from: 'ecu',       to: 'actuators' },
      { id: 'fan-control',         from: 'ecu',       to: 'actuators' },
      { id: 'can-bus',             from: 'ecu',       to: 'cabin' },
      { id: 'wideband-o2',         from: 'cabin',     to: 'ecu' },
      { id: 'tacho-output',        from: 'ecu',       to: 'cabin' },
    ],
    overrides: {
      'vvt-solenoid': {
        name: 'VTC Cam Phasing Solenoid',
        fn: 'Honda\'s VTC continuously phases the intake cam and is separate from the VTEC rocker-switching solenoid — a K-series build normally needs both, driven from two independent ECU outputs. Wiring one to the other\'s output is a common swap mistake that produces a car which runs but never comes onto the second cam profile.',
      },
      'ignition-coil-drive': {
        fn: 'K-series coils are coil-on-plug with the igniter built into each coil, so the ECU supplies a logic-level trigger directly and no external ignition module is required. Each coil still needs its own switched 12 V feed and a solid ground.',
      },
    },
  },
};

/* Exposed for the viewer (js/wiring-diagram.js) and for Node-based tests. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WIRE_GAUGES, CIRCUIT_CATEGORIES, CIRCUIT_LIBRARY, WIRING_PLATFORMS };
}
