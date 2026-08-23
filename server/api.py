from flask import Flask, jsonify, request
from physics_engine import SargassumPhysicsEngine

app = Flask(__name__)
engine = SargassumPhysicsEngine()

@app.route('/state', methods=['GET'])
def get_state():
    return jsonify({
        "budget": engine.budget,
        "h2s": engine.h2s_global_level,
        "attractiveness": engine.tourist_attractiveness
    })

@app.route('/action', methods=['POST'])
def perform_action():
    data = request.json
    action_type = data.get("action")
    success, new_budget = engine.deploy_countermeasure(action_type)
    
    # Simple simulation step
    engine.compute_h2s_emission(100, 30, 80) # Mock values
    
    return jsonify({
        "success": success,
        "budget": new_budget,
        "h2s": engine.h2s_global_level,
        "attractiveness": engine.tourist_attractiveness
    })

if __name__ == '__main__':
    app.run(port=5000)
