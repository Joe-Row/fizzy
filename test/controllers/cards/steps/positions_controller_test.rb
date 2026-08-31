require "test_helper"

class Cards::Steps::PositionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    sign_in_as :kevin
  end

  test "create reorders steps" do
    card = cards(:logo)
    first = card.steps.create!(content: "First")
    second = card.steps.create!(content: "Second")

    post card_step_position_path(card, second), params: { before_id: first.id }

    assert_response :no_content
    assert_equal [ second, first ], card.steps.ranked.where(id: [ first.id, second.id ]).to_a
  end
end
